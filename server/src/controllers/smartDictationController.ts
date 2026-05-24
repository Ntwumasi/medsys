import { Request, Response } from 'express';
import OpenAI, { toFile } from 'openai';

// Per-section formatting guidance for polishSection. ROS subsections fall
// through to a default "pertinent positives/negatives bullet list" prompt.
const SECTION_FORMATS: Record<string, string> = {
  chief_complaint:        'Output ONE short sentence stating the reason for visit. No preamble.',
  hpi:                    'Output a single narrative paragraph in clinical voice. Preserve onset, duration, severity, quality, location, modifying factors, associated symptoms.',
  past_medical_history:   'Output a bulleted list (one condition per line, "- "). Expand abbreviations (HTN→Hypertension, DM→Diabetes Mellitus).',
  past_surgical_history:  'Output a bulleted list (one surgery per line). Include year if mentioned.',
  health_maintenance:     'Output a bulleted list of screenings/health behaviours noted.',
  immunization_history:   'Output a bulleted list. Format: "- Vaccine — date or status".',
  home_medications:       'Output a bulleted list. Format: "- Medication dose frequency route" per line.',
  allergies:              'Output a bulleted list. Format: "- Allergen — reaction (severity)" per line. If "no known allergies", write exactly: "NKDA".',
  social_history:         'Output 2-4 short lines covering tobacco, alcohol, drugs, occupation, exercise if mentioned. Use "- Topic: detail" format.',
  family_history:         'Output a bulleted list grouped by relative. Format: "- Relative: condition(s)".',
  primary_care_provider:  'Output a single line with PCP name and contact if mentioned.',
  vital_signs:            'Output any narrative notes about the vitals. If the dictation contains numeric vitals, list them as "- Metric: value unit" per line.',
  physical_exam:          'Output narrative grouped by system (General, HEENT, Cardiac, Lungs, Abdomen, Extremities, Neuro, Skin). One short paragraph per system actually examined.',
  lab_results:            'Output a bulleted list of lab values mentioned. Format: "- Test: value unit (flag if abnormal)".',
  imaging_results:        'Output a short paragraph summarizing imaging findings.',
  assessment:             'Output a numbered problem list. Each item: "1. Problem — brief clinical reasoning."',
  plan:                   'Output a numbered plan. Each item: "1. Action (medication/order/follow-up/patient education)."',
};

const ROS_DEFAULT_FORMAT = 'Output a bulleted list of pertinent positives and negatives for this Review of Systems subsection. Format: "- Symptom: present/denied".';
const FALLBACK_FORMAT = 'Clean up grammar and punctuation. Expand common medical abbreviations. Preserve the clinical content exactly as dictated. Use bullet lists if the content is enumerable, otherwise a short paragraph.';

const formatFor = (sectionId: string): string => {
  if (SECTION_FORMATS[sectionId]) return SECTION_FORMATS[sectionId];
  if (sectionId.startsWith('ros_')) return ROS_DEFAULT_FORMAT;
  return FALLBACK_FORMAT;
};

// H&P Section definitions matching HPAccordion
const HP_SECTIONS = [
  { id: 'chief_complaint', title: "Today's Visit / Chief Complaint" },
  { id: 'hpi', title: 'HPI / Subjective / Objective' },
  { id: 'past_medical_history', title: 'Past Medical History' },
  { id: 'past_surgical_history', title: 'Past Surgical History' },
  { id: 'health_maintenance', title: 'Health Maintenance' },
  { id: 'immunization_history', title: 'Immunization History' },
  { id: 'home_medications', title: 'Home Medications' },
  { id: 'allergies', title: 'Allergies' },
  { id: 'social_history', title: 'Social History' },
  { id: 'family_history', title: 'Family History' },
  { id: 'primary_care_provider', title: 'Primary Care Provider' },
  // ROS subsections
  { id: 'ros_constitutional', title: 'ROS - Constitutional' },
  { id: 'ros_allergic', title: 'ROS - Allergic / Immunologic' },
  { id: 'ros_head', title: 'ROS - Head' },
  { id: 'ros_eyes', title: 'ROS - Eyes' },
  { id: 'ros_ent', title: 'ROS - Ears, Nose, Mouth and Throat' },
  { id: 'ros_neck', title: 'ROS - Neck' },
  { id: 'ros_breasts', title: 'ROS - Breasts' },
  { id: 'ros_respiratory', title: 'ROS - Respiratory' },
  { id: 'ros_cardiac', title: 'ROS - Cardiac/Peripheral Vascular' },
  { id: 'ros_gi', title: 'ROS - Gastrointestinal' },
  { id: 'ros_gu', title: 'ROS - Genitourinary' },
  { id: 'ros_musculoskeletal', title: 'ROS - Musculoskeletal' },
  { id: 'ros_skin', title: 'ROS - Skin' },
  { id: 'ros_neuro', title: 'ROS - Neurological' },
  { id: 'ros_psych', title: 'ROS - Psychiatric' },
  { id: 'ros_endo', title: 'ROS - Endocrine' },
  { id: 'ros_heme', title: 'ROS - Hematologic/Lymphatic' },
  { id: 'vital_signs', title: 'Vital Signs' },
  { id: 'physical_exam', title: 'Physical Exam' },
  { id: 'lab_results', title: 'Lab Results' },
  { id: 'imaging_results', title: 'Imaging Results' },
  { id: 'assessment', title: 'Assessment/Problem List' },
  { id: 'plan', title: 'Plan' },
];

const SYSTEM_PROMPT = `You are a medical documentation assistant. Your task is to parse a physician's or nurse's dictated clinical notes and categorize the content into structured H&P (History & Physical) sections.

AVAILABLE SECTIONS:
${HP_SECTIONS.map(s => `- ${s.id}: ${s.title}`).join('\n')}

INSTRUCTIONS:
1. Analyze the dictated text carefully
2. Extract relevant clinical information for each applicable section
3. Only include sections that have relevant content in the dictation
4. Preserve medical terminology and specifics exactly as dictated
5. Format content appropriately (use bullet points for lists, maintain clinical language)
6. If information could belong to multiple sections, place it in the most appropriate one
7. Do NOT add information that was not in the original dictation
8. For Review of Systems (ros_*), look for symptoms mentioned by system
9. For Physical Exam, look for examination findings
10. For Assessment, look for diagnoses or clinical impressions
11. For Plan, look for treatment plans, orders, or follow-up instructions

COMMON DICTATION PATTERNS TO RECOGNIZE:
- "Chief complaint" or "presenting with" or "here for" → chief_complaint
- "History of present illness" or describes symptom onset/duration → hpi
- "Past medical history" or "has a history of" → past_medical_history
- "Surgical history" or "prior surgeries" → past_surgical_history
- "Takes" or "home medications" or "currently on" → home_medications
- "Allergic to" or "allergies include" → allergies
- "Smokes" or "drinks" or "uses" or "works as" → social_history
- "Family history" or "mother/father has" → family_history
- "Denies" or "reports" followed by symptoms → ros_* (appropriate system)
- "On exam" or "physical examination" → physical_exam
- "Impression" or "diagnosis" or "assessment" → assessment
- "Plan" or "will order" or "recommend" → plan

RESPONSE FORMAT:
Return a JSON object with section_id as keys and the parsed content as string values.
Only include sections that have relevant content. Example:

{
  "chief_complaint": "Chest pain for 3 days",
  "hpi": "45-year-old male presenting with substernal chest pain, started 3 days ago, worse with exertion, associated with shortness of breath",
  "family_history": "Father with hypertension, mother with diabetes",
  "physical_exam": "Heart: Regular rate and rhythm, no murmurs. Lungs: Clear to auscultation bilaterally.",
  "assessment": "1. Atypical chest pain\\n2. Rule out ACS",
  "plan": "1. EKG and troponins\\n2. Chest X-ray\\n3. Cardiology consult if positive"
}`;

export const parseDictation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { transcript } = req.body;

    if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
      res.status(400).json({ error: 'Transcript is required' });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('OPENAI_API_KEY not configured');
      res.status(500).json({ error: 'AI service not configured. Please add OPENAI_API_KEY to environment variables.' });
      return;
    }

    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Parse the following clinical dictation into H&P sections:\n\n${transcript}` },
      ],
      temperature: 0.2, // Low temperature for consistent parsing
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      res.status(500).json({ error: 'Empty response from AI' });
      return;
    }

    let parsedSections: Record<string, string>;
    try {
      parsedSections = JSON.parse(responseText);
    } catch {
      console.error('Failed to parse AI response as JSON:', responseText);
      res.status(500).json({ error: 'Invalid response format from AI' });
      return;
    }

    // Validate that returned keys are valid section IDs
    const validSectionIds = new Set(HP_SECTIONS.map(s => s.id));
    const validatedSections: Record<string, string> = {};

    for (const [key, value] of Object.entries(parsedSections)) {
      if (validSectionIds.has(key) && typeof value === 'string' && value.trim()) {
        validatedSections[key] = value.trim();
      }
    }

    // Build section metadata for the response
    const sectionMeta = HP_SECTIONS.filter(s => validatedSections[s.id]).map(s => ({
      id: s.id,
      title: s.title,
    }));

    res.json({
      success: true,
      sections: validatedSections,
      sectionMeta,
      sectionCount: Object.keys(validatedSections).length,
    });
  } catch (error: any) {
    console.error('Parse dictation error:', error);

    if (error.code === 'invalid_api_key') {
      res.status(500).json({ error: 'AI service configuration error. Please check the API key.' });
    } else if (error.code === 'rate_limit_exceeded') {
      res.status(429).json({ error: 'AI service rate limit exceeded. Please try again in a moment.' });
    } else if (error.code === 'insufficient_quota') {
      res.status(402).json({ error: 'AI service quota exceeded. Please check your OpenAI account.' });
    } else {
      res.status(500).json({ error: 'Failed to parse dictation. Please try again.' });
    }
  }
};

/**
 * POST /api/hp/transcribe
 * Body: { audio_base64: string, mime_type?: string }
 * Returns: { text: string }
 *
 * Pipes the recorded audio (typically a ~30-60s WebM Opus blob from
 * MediaRecorder) through Whisper. Whisper handles medical vocabulary far
 * better than the browser SpeechRecognition API.
 */
export const transcribeAudio = async (req: Request, res: Response): Promise<void> => {
  try {
    const { audio_base64, mime_type } = req.body || {};
    if (!audio_base64 || typeof audio_base64 !== 'string') {
      res.status(400).json({ error: 'audio_base64 is required' });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'AI service not configured.' });
      return;
    }

    const buffer = Buffer.from(audio_base64, 'base64');
    if (buffer.length === 0) {
      res.status(400).json({ error: 'Empty audio payload' });
      return;
    }

    const ext = (mime_type || '').includes('mp4') ? 'mp4'
              : (mime_type || '').includes('wav') ? 'wav'
              : (mime_type || '').includes('mpeg') ? 'mp3'
              : 'webm';

    const openai = new OpenAI({ apiKey });
    const file = await toFile(buffer, `dictation.${ext}`);

    const result = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      // Light prompt to bias Whisper toward clinical vocabulary
      prompt: 'Clinical dictation by a physician or nurse. Medical terminology, drug names, dosages.',
      language: 'en',
    });

    res.json({ text: (result.text || '').trim() });
  } catch (error: any) {
    console.error('Transcribe audio error:', error);
    if (error.code === 'rate_limit_exceeded') {
      res.status(429).json({ error: 'AI service rate limit exceeded. Please try again.' });
    } else if (error.code === 'insufficient_quota') {
      res.status(402).json({ error: 'AI service quota exceeded.' });
    } else {
      res.status(500).json({ error: 'Failed to transcribe audio.' });
    }
  }
};

/**
 * POST /api/hp/polish-section
 * Body: { section_id: string, section_title: string, raw_text: string }
 * Returns: { polished_text: string }
 *
 * Takes raw dictation transcript for a single SOAP section and rewrites it
 * in the format expected for that section (lists for Allergies / PMH,
 * narrative for HPI, numbered list for Assessment/Plan, etc).
 */
export const polishSection = async (req: Request, res: Response): Promise<void> => {
  try {
    const { section_id, section_title, raw_text } = req.body || {};
    if (!raw_text || typeof raw_text !== 'string' || !raw_text.trim()) {
      res.status(400).json({ error: 'raw_text is required' });
      return;
    }
    if (!section_id || !section_title) {
      res.status(400).json({ error: 'section_id and section_title are required' });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'AI service not configured.' });
      return;
    }

    const format = formatFor(section_id);

    const system = `You are a clinical scribe. The clinician is dictating into the "${section_title}" section of a SOAP note.

Your job: rewrite the raw dictation cleanly for THIS section.

Rules:
- Preserve ALL clinical content. Do not invent or omit facts.
- Fix grammar, punctuation, capitalization.
- Expand obvious medical abbreviations (HTN→Hypertension, DM→Diabetes Mellitus, SOB→Shortness of Breath).
- Remove filler ("um", "uh", "so", "okay let me see").
- ${format}
- Output ONLY the polished text for this section. No headings, no preamble, no explanation, no markdown fences.`;

    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Raw dictation:\n\n${raw_text.trim()}` },
      ],
      temperature: 0.2,
      max_tokens: 1500,
    });

    const polished = completion.choices[0]?.message?.content?.trim() || '';
    if (!polished) {
      res.status(500).json({ error: 'Empty response from AI' });
      return;
    }

    res.json({ polished_text: polished });
  } catch (error: any) {
    console.error('Polish section error:', error);
    if (error.code === 'rate_limit_exceeded') {
      res.status(429).json({ error: 'AI service rate limit exceeded. Please try again.' });
    } else if (error.code === 'insufficient_quota') {
      res.status(402).json({ error: 'AI service quota exceeded.' });
    } else {
      res.status(500).json({ error: 'Failed to polish dictation.' });
    }
  }
};
