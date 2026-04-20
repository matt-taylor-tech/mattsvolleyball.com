/**
 * Registration Status Endpoint
 * 
 * Returns lightweight registration status for client-side dynamic button updates.
 * Cached for 5 minutes to reduce TeamLinkt API load.
 */

import { getRegistrationData } from '../../src/lib/registration';
import { NEXT_NEXT_SEASON_LABEL, UPCOMING_SEASON_ID } from '../../src/lib/seasonConfig';

export const onRequestGet: PagesFunction = async () => {
  try {
    const { seasonLabel, regStatus, seasonDates, earliestOpen, latestClose } = await getRegistrationData({
      preferredSeasonId: UPCOMING_SEASON_ID,
    });

    return Response.json(
      {
        regStatus,
        seasonLabel,
        seasonDates,
        earliestOpen,
        latestClose,
        nextNextSeasonLabel: NEXT_NEXT_SEASON_LABEL,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=300, s-maxage=300',
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching registration status:', error);
    return Response.json(
      { error: 'Failed to fetch registration status', regStatus: 'unknown' },
      { status: 500 }
    );
  }
};
