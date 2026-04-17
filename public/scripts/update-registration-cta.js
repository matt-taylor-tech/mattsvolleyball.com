/**
 * Dynamic Registration Status Updater
 * 
 * Fetches current registration status and updates CTA buttons across the site.
 * Automatically detects elements with data-cta-type and updates button text/href.
 * 
 * Usage in Astro:
 *   <script is:inline src="/scripts/update-registration-cta.js"></script>
 * 
 * HTML elements to mark:
 *   - data-cta-type="register-now"  → "Register Now" button
 *   - data-cta-type="sign-up"       → "Sign Up" text/button
 *   - data-cta-type="view-leagues"  → "View Leagues" fallback
 */

async function updateRegistrationCTA() {
  try {
    const response = await fetch('/api/registration-status');
    if (!response.ok) throw new Error(`API returned ${response.status}`);

    const data = await response.json();
    const { regStatus, seasonLabel, earliestOpen, latestClose } = data;

    // Format dates for display
    const formatDate = (dateStr) => {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const formatFullDate = (dateStr) => {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { 
        weekday: 'long',
        month: 'long', 
        day: 'numeric' 
      });
    };

    const REG_PAGE = 'https://app.teamlinkt.com/register/find/mattsvolleyball';

    // Update all elements with registration CTA markers
    document.querySelectorAll('[data-cta-type]').forEach((el) => {
      const type = el.getAttribute('data-cta-type');

      if (type === 'register-now') {
        if (regStatus === 'open') {
          el.textContent = 'Register Now';
          el.href = REG_PAGE;
          el.target = '_blank';
          el.rel = 'noopener noreferrer';
          el.classList.remove('hidden');
        } else if (regStatus === 'coming-soon') {
          el.textContent = `Registration Opens ${formatFullDate(earliestOpen)}`;
          el.href = '#';
          el.classList.add('pointer-events-none', 'opacity-75');
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      } 
      
      else if (type === 'sign-up') {
        if (regStatus === 'open') {
          el.textContent = 'Sign Up';
          el.href = REG_PAGE;
          el.target = '_blank';
          el.rel = 'noopener noreferrer';
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      }
      
      else if (type === 'view-leagues') {
        el.textContent = 'View Leagues';
        el.href = '/leagues/';
        el.classList.remove('hidden');
      }
    });

    // Update header CTA button if it exists
    const headerCTA = document.querySelector('[data-header-cta]');
    if (headerCTA) {
      if (regStatus === 'open') {
        headerCTA.textContent = 'Sign Up';
        headerCTA.href = REG_PAGE;
        headerCTA.target = '_blank';
        headerCTA.rel = 'noopener noreferrer';
      } else if (regStatus === 'coming-soon') {
        headerCTA.textContent = 'Coming Soon';
        headerCTA.href = '#';
        headerCTA.classList.add('pointer-events-none', 'opacity-75');
      } else {
        headerCTA.textContent = 'Leagues';
        headerCTA.href = '/leagues/';
      }
    }

  } catch (error) {
    console.error('Failed to update registration CTA:', error);
    // Silently fail - page will show build-time fallback
  }
}

// Update on page load and every 5 minutes
document.addEventListener('DOMContentLoaded', updateRegistrationCTA);
setInterval(updateRegistrationCTA, 5 * 60 * 1000);

// Also update when page becomes visible (tab focus)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    updateRegistrationCTA();
  }
});
