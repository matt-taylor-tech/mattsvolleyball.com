/**
 * Registration Status Endpoint
 * 
 * Returns lightweight registration status for client-side dynamic button updates.
 * Cached for 5 minutes to reduce TeamLinkt API load.
 */

import { getRegistrationData } from '../../src/lib/registration';
import {
  NEXT_NEXT_SEASON_LABEL, UPCOMING_SEASON_ID, UPCOMING_SEASON_LABEL, UPCOMING_REG_OPEN_DATETIME,
} from '../../src/lib/seasonConfig';

export const onRequestGet: PagesFunction = async () => {
  try {
    let {
      seasonLabel, regStatus, seasonDates, earliestOpen, latestClose,
      hasOpenRegistration, openRegUrl, openRegIsExternal, openRegDay,
    } = await getRegistrationData({
      preferredSeasonId: UPCOMING_SEASON_ID,
    });

    // Config-driven "coming soon" before TeamLinkt publishes the upcoming season's
    // forms publicly. Mirrors the build-time hero in src/pages/index.astro so the
    // live CTA updater stays consistent. Once the forms are public (seasonLabel is
    // set) or the announced date passes, this yields to live TeamLinkt data.
    const announcedOpenDate = UPCOMING_REG_OPEN_DATETIME
      ? new Date(UPCOMING_REG_OPEN_DATETIME.replace(' ', 'T'))
      : null;
    if (!seasonLabel && announcedOpenDate && new Date() < announcedOpenDate) {
      regStatus = 'coming-soon';
      seasonLabel = UPCOMING_SEASON_LABEL;
      earliestOpen = UPCOMING_REG_OPEN_DATETIME;
    }

    return Response.json(
      {
        regStatus,
        seasonLabel,
        seasonDates,
        earliestOpen,
        latestClose,
        nextNextSeasonLabel: NEXT_NEXT_SEASON_LABEL,
        hasOpenRegistration,
        openRegUrl,
        openRegIsExternal,
        openRegDay,
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
