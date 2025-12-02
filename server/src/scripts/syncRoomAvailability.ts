/**
 * Script to sync room availability with actual patient assignments
 *
 * This script:
 * 1. Finds all rooms that are currently occupied by active encounters
 * 2. Marks all other rooms as available
 *
 * Run with: npx ts-node src/scripts/syncRoomAvailability.ts
 */

import pool from '../database/db';

interface Room {
  id: number;
  room_number: string;
  room_name: string;
  is_available: boolean;
}

interface EncounterRoom {
  room_id: number;
}

async function syncRoomAvailability() {
  const client = await pool.connect();

  try {
    console.log('Starting room availability sync...\n');

    // Get current state
    const beforeRooms = await client.query(
      `SELECT id, room_number, room_name, is_available FROM rooms ORDER BY room_number`
    );
    console.log('Current room status:');
    beforeRooms.rows.forEach((room: Room) => {
      console.log(`  Room ${room.room_number} (${room.room_name}): ${room.is_available ? 'Available' : 'Occupied'}`);
    });

    // Find rooms that actually have active encounters (not completed/discharged)
    const occupiedRooms = await client.query(`
      SELECT DISTINCT e.room_id
      FROM encounters e
      WHERE e.room_id IS NOT NULL
        AND e.status NOT IN ('completed', 'discharged', 'cancelled')
    `);

    const occupiedRoomIds = occupiedRooms.rows.map((r: EncounterRoom) => r.room_id);
    console.log(`\nRooms with active encounters: ${occupiedRoomIds.length > 0 ? occupiedRoomIds.join(', ') : 'None'}`);

    // Start transaction
    await client.query('BEGIN');

    // First, mark ALL rooms as available
    const resetResult = await client.query(
      `UPDATE rooms SET is_available = true, updated_at = CURRENT_TIMESTAMP`
    );
    console.log(`\nReset ${resetResult.rowCount} rooms to available`);

    // Then mark only the actually occupied rooms as unavailable
    if (occupiedRoomIds.length > 0) {
      const occupyResult = await client.query(
        `UPDATE rooms SET is_available = false, updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1)`,
        [occupiedRoomIds]
      );
      console.log(`Marked ${occupyResult.rowCount} rooms as occupied`);
    }

    await client.query('COMMIT');

    // Show final state
    const afterRooms = await client.query(
      `SELECT id, room_number, room_name, is_available FROM rooms ORDER BY room_number`
    );
    console.log('\nUpdated room status:');
    afterRooms.rows.forEach((room: Room) => {
      console.log(`  Room ${room.room_number} (${room.room_name}): ${room.is_available ? '✅ Available' : '🔴 Occupied'}`);
    });

    console.log('\n✅ Room availability sync completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error syncing room availability:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the script
syncRoomAvailability()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
