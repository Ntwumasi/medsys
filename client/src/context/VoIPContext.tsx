import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import voipAPI from '../api/voip';
import type { OnlineUser, VoIPCall } from '../api/voip';
import { useSmartPolling } from '../hooks/useSmartPolling';

// ── Types ──

type CallState = 'idle' | 'ringing_out' | 'ringing_in' | 'connecting' | 'active';

interface VoIPContextType {
  callState: CallState;
  currentCall: VoIPCall | null;
  remoteUser: { id: number; name: string; role: string } | null;
  isMuted: boolean;
  callDuration: number;
  onlineUsers: OnlineUser[];
  callUser: (userId: number) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  hangUp: () => Promise<void>;
  toggleMute: () => void;
}

const VoIPContext = createContext<VoIPContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useVoIP = () => {
  const ctx = useContext(VoIPContext);
  if (!ctx) throw new Error('useVoIP must be used within VoIPProvider');
  return ctx;
};

// ── ICE Config ──

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

// ── Provider ──

export const VoIPProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [callState, setCallState] = useState<CallState>('idle');
  const [currentCall, setCurrentCall] = useState<VoIPCall | null>(null);
  const [remoteUser, setRemoteUser] = useState<{ id: number; name: string; role: string } | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const signalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSignalIdRef = useRef(0);
  const callStateRef = useRef(callState);
  const currentCallRef = useRef(currentCall);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);

  // Keep refs in sync
  useEffect(() => { callStateRef.current = callState; }, [callState]);
  useEffect(() => { currentCallRef.current = currentCall; }, [currentCall]);

  const isLoggedIn = !!localStorage.getItem('token');

  // ── Audio setup ──
  useEffect(() => {
    remoteAudioRef.current = new Audio();
    remoteAudioRef.current.autoplay = true;
    return () => {
      remoteAudioRef.current?.pause();
      remoteAudioRef.current = null;
    };
  }, []);

  // ── Cleanup helper ──
  const cleanup = useCallback(() => {
    // Stop signal polling
    if (signalPollRef.current) { clearInterval(signalPollRef.current); signalPollRef.current = null; }
    if (statusPollRef.current) { clearInterval(statusPollRef.current); statusPollRef.current = null; }
    if (durationTimerRef.current) { clearInterval(durationTimerRef.current); durationTimerRef.current = null; }

    // Stop ringtone
    if (ringtoneRef.current) { ringtoneRef.current.pause(); ringtoneRef.current.currentTime = 0; }

    // Close peer connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    // Stop microphone
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }

    lastSignalIdRef.current = 0;
    setCallDuration(0);
    setIsMuted(false);
    setCurrentCall(null);
    setRemoteUser(null);
    setCallState('idle');
  }, []);

  // ── Presence heartbeat + fetch online users (every 30s) ──
  const heartbeatFn = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const status = callStateRef.current === 'active' ? 'in_call' : 'online';
      await voipAPI.heartbeat(status);
      const { data } = await voipAPI.getPresence();
      setOnlineUsers(data.users);
      console.log('[VoIP] Heartbeat sent, online users:', data.users.length, data.users.map((u: OnlineUser) => `${u.first_name} ${u.last_name}`));
    } catch (err) {
      console.warn('[VoIP] Heartbeat failed:', err);
    }
  }, [isLoggedIn]);

  useSmartPolling(heartbeatFn, 30_000, isLoggedIn);

  // ── Poll for incoming calls (every 2s when idle) ──
  const checkIncoming = useCallback(async () => {
    if (!isLoggedIn || callStateRef.current !== 'idle') return;
    try {
      const { data } = await voipAPI.getIncoming();
      if (data.call) {
        const call = data.call;
        setCurrentCall(call);
        setRemoteUser({
          id: call.caller_id,
          name: `${call.first_name} ${call.last_name}`,
          role: call.role || '',
        });
        setCallState('ringing_in');

        // Play ringtone
        try {
          ringtoneRef.current = new Audio('/ringtone.mp3');
          ringtoneRef.current.loop = true;
          ringtoneRef.current.play().catch(() => {});
        } catch {
          // Audio may not be available
        }
      }
    } catch {
      // Ignore
    }
  }, [isLoggedIn]);

  useSmartPolling(checkIncoming, 2_000, isLoggedIn && callState === 'idle');

  // ── Start signal polling for a call ──
  const startSignalPolling = useCallback((callId: number) => {
    if (signalPollRef.current) clearInterval(signalPollRef.current);

    signalPollRef.current = setInterval(async () => {
      try {
        const { data } = await voipAPI.getSignals(callId, lastSignalIdRef.current);
        for (const signal of data.signals) {
          lastSignalIdRef.current = signal.id;
          const pc = pcRef.current;
          if (!pc) continue;

          if (signal.type === 'answer') {
            const sdp = JSON.parse(signal.payload);
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            setCallState('connecting');
          } else if (signal.type === 'ice_candidate') {
            const candidate = JSON.parse(signal.payload);
            if (candidate) {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
          }
        }
      } catch {
        // Ignore — will retry next tick
      }
    }, 1000);
  }, []);

  // ── Create peer connection ──
  const createPeerConnection = useCallback((callId: number): RTCPeerConnection => {
    const pc = new RTCPeerConnection(ICE_CONFIG);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        voipAPI.sendSignal(callId, 'ice_candidate', JSON.stringify(event.candidate)).catch(() => {});
      }
    };

    pc.ontrack = (event) => {
      if (remoteAudioRef.current && event.streams[0]) {
        remoteAudioRef.current.srcObject = event.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallState('active');
        // Start duration timer
        if (!durationTimerRef.current) {
          durationTimerRef.current = setInterval(() => {
            setCallDuration(d => d + 1);
          }, 1000);
        }
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        // Auto hang up on connection drop
        if (currentCallRef.current) {
          voipAPI.endCall(currentCallRef.current.id).catch(() => {});
        }
        cleanup();
      }
    };

    pcRef.current = pc;
    return pc;
  }, [cleanup]);

  // ── Call a user (outgoing) ──
  const callUser = useCallback(async (userId: number) => {
    if (callStateRef.current !== 'idle') return;

    try {
      // Find user info from online users first (before mic prompt)
      const user = onlineUsers.find(u => u.id === userId);
      if (!user) {
        console.warn('[VoIP] User not in onlineUsers list:', userId);
        return;
      }

      // Get microphone
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (micErr) {
        console.error('[VoIP] Microphone access denied:', micErr);
        alert('Microphone access is required for voice calls. Please allow microphone access and try again.');
        return;
      }
      localStreamRef.current = stream;

      setRemoteUser({ id: user.id, name: `${user.first_name} ${user.last_name}`, role: user.role });
      setCallState('ringing_out');

      // Create peer connection (we'll set callId after API response)
      const pc = new RTCPeerConnection(ICE_CONFIG);
      pcRef.current = pc;

      // Add local audio
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send to server
      const { data } = await voipAPI.createCall(userId, JSON.stringify(offer));
      const call = data.call;
      setCurrentCall(call);

      // Now set up the full peer connection with the call ID
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          voipAPI.sendSignal(call.id, 'ice_candidate', JSON.stringify(event.candidate)).catch(() => {});
        }
      };

      pc.ontrack = (event) => {
        if (remoteAudioRef.current && event.streams[0]) {
          remoteAudioRef.current.srcObject = event.streams[0];
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setCallState('active');
          if (!durationTimerRef.current) {
            durationTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
          }
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          voipAPI.endCall(call.id).catch(() => {});
          cleanup();
        }
      };

      // Start polling for signals (answer + ICE from callee)
      startSignalPolling(call.id);

      // Poll for call status (detect decline/missed)
      statusPollRef.current = setInterval(async () => {
        try {
          const { data: statusData } = await voipAPI.getCallStatus(call.id);
          if (statusData.call.status === 'declined' || statusData.call.status === 'missed') {
            cleanup();
          }
        } catch {
          // Ignore
        }
      }, 2000);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      const apiMsg = (err && typeof err === 'object' && 'response' in err)
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      console.error('[VoIP] Failed to start call:', apiMsg || msg, err);
      alert(`Call failed: ${apiMsg || msg}`);
      cleanup();
    }
  }, [onlineUsers, cleanup, startSignalPolling]);

  // ── Accept incoming call ──
  const acceptCall = useCallback(async () => {
    const call = currentCallRef.current;
    if (!call || callStateRef.current !== 'ringing_in') return;

    try {
      // Stop ringtone
      if (ringtoneRef.current) { ringtoneRef.current.pause(); ringtoneRef.current.currentTime = 0; }

      // Get microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      // Create peer connection
      const pc = createPeerConnection(call.id);

      // Add local audio
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Set remote offer
      const offerSdp = JSON.parse(call.offer_sdp!);
      await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));

      // Create answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Send answer to server
      await voipAPI.answerCall(call.id, JSON.stringify(answer));

      setCallState('connecting');

      // Start polling for ICE candidates from caller
      startSignalPolling(call.id);

    } catch (err) {
      console.error('Failed to accept call:', err);
      cleanup();
    }
  }, [createPeerConnection, startSignalPolling, cleanup]);

  // ── Decline incoming call ──
  const declineCallFn = useCallback(async () => {
    const call = currentCallRef.current;
    if (!call) return;

    try {
      if (ringtoneRef.current) { ringtoneRef.current.pause(); ringtoneRef.current.currentTime = 0; }
      await voipAPI.declineCall(call.id);
    } catch {
      // Ignore
    }
    cleanup();
  }, [cleanup]);

  // ── Hang up ──
  const hangUp = useCallback(async () => {
    const call = currentCallRef.current;
    if (!call) { cleanup(); return; }

    try {
      if (ringtoneRef.current) { ringtoneRef.current.pause(); ringtoneRef.current.currentTime = 0; }
      const state = callStateRef.current;
      if (state === 'ringing_out') {
        await voipAPI.cancelCall(call.id);
      } else if (state === 'active' || state === 'connecting') {
        await voipAPI.endCall(call.id);
      }
    } catch {
      // Ignore — cleanup anyway
    }
    cleanup();
  }, [cleanup]);

  // ── Mute toggle ──
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, []);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  // ── Cleanup on tab close ──
  useEffect(() => {
    const handleBeforeUnload = () => {
      const call = currentCallRef.current;
      if (call && callStateRef.current !== 'idle') {
        // Use sendBeacon for reliable delivery on tab close
        const token = localStorage.getItem('token');
        const url = callStateRef.current === 'ringing_out'
          ? `/api/voip/calls/${call.id}/cancel`
          : `/api/voip/calls/${call.id}/end`;
        navigator.sendBeacon(url, JSON.stringify({ token }));
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const value: VoIPContextType = {
    callState,
    currentCall,
    remoteUser,
    isMuted,
    callDuration,
    onlineUsers,
    callUser,
    acceptCall,
    declineCall: declineCallFn,
    hangUp,
    toggleMute,
  };

  return (
    <VoIPContext.Provider value={value}>
      {children}
    </VoIPContext.Provider>
  );
};
