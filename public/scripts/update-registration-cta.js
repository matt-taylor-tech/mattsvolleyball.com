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
    const { regStatus, seasonLabel, seasonDates, earliestOpen, latestClose, nextNextSeasonLabel, hasOpenRegistration, openRegUrl, openRegIsExternal } = data;

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));

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

    // Keep in sync with REGISTRATION_PAGE_URL in src/lib/seasonConfig.ts. The
    // cid matters: without it TeamLinkt's find page tells visitors there are no
    // registration forms available. This file is served as-is, so it cannot
    // import the config.
    const REG_PAGE = data.registrationPageUrl
      || 'https://app.teamlinkt.com/register/find/mattsvolleyball?cid=77315';

    const updateHomeHero = () => {
      const heroSection = document.querySelector('[data-hero-no-update]');
      if (heroSection) return; // Skip if hero has intentional override
      
      const heading = document.querySelector('[data-home-hero-heading]');
      const promo = document.querySelector('[data-home-hero-promo]');
      const seasonDatesEl = document.querySelector('[data-home-hero-season-dates]');
      const ctaGroup = document.querySelector('[data-home-hero-cta-group]');

      if (heading) {
        if (regStatus === 'open' && seasonLabel) {
          heading.innerHTML = `Sign Up for<br><span class="text-coral-400">${escapeHtml(seasonLabel.toUpperCase())}!</span>`;
        } else if (regStatus === 'coming-soon' && seasonLabel) {
          heading.innerHTML = `<span class="text-coral-400">${escapeHtml(seasonLabel.toUpperCase())}</span><br>Is Coming!`;
        } else if (regStatus === 'in-progress' && seasonLabel) {
          heading.innerHTML = `<span class="text-coral-400">${escapeHtml(seasonLabel.toUpperCase())}</span><br>Is Underway!`;
        } else if (regStatus === 'closed' && nextNextSeasonLabel) {
          heading.innerHTML = `<span class="text-coral-400">${escapeHtml(nextNextSeasonLabel.toUpperCase())}</span><br>Is Coming!`;
        } else {
          heading.innerHTML = '<span class="text-coral-400">Lake Norman</span><br>Sand Volleyball';
        }
      }

      if (promo) {
        if (regStatus === 'open' && seasonLabel) {
          promo.textContent = `${seasonLabel} registration is open now.`;
        } else if (regStatus === 'coming-soon' && seasonLabel) {
          promo.textContent = `${seasonLabel} registration opens ${formatFullDate(earliestOpen)}.`;
        } else if (regStatus === 'in-progress' && seasonLabel) {
          promo.textContent = `${seasonLabel} is underway.`;
        } else {
          promo.textContent = 'League updates land here first.';
        }
      }

      if (seasonDatesEl) {
        if (seasonDates?.start && seasonDates?.end) {
          seasonDatesEl.textContent = `${seasonDates.start} – ${seasonDates.end}${regStatus === 'open' ? ` · Registration closes ${formatDate(latestClose)}` : ''}`;
          seasonDatesEl.classList.remove('hidden');
        } else {
          seasonDatesEl.textContent = '';
          seasonDatesEl.classList.add('hidden');
        }
      }

      if (ctaGroup) {
        ctaGroup.replaceChildren();

        const createLink = ({ href, text, className, target, rel, disabled = false }) => {
          const link = document.createElement('a');
          link.href = href;
          link.textContent = text;
          link.className = className;
          if (target) link.target = target;
          if (rel) link.rel = rel;
          if (disabled) {
            link.setAttribute('aria-disabled', 'true');
          }
          return link;
        };

        if (regStatus === 'open') {
          ctaGroup.append(
            createLink({
              href: REG_PAGE,
              text: 'Register Now',
              className: 'btn-primary text-xl py-4 px-10',
              target: '_blank',
              rel: 'noopener noreferrer',
            }),
            createLink({
              href: '/leagues/',
              text: 'View Leagues',
              className: 'btn-secondary text-xl py-4 px-10',
            }),
          );
        } else if (regStatus === 'coming-soon') {
          ctaGroup.append(
            createLink({
              href: '#',
              text: `Registration Opens ${formatFullDate(earliestOpen)}`,
              className: 'inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm px-8 py-4 rounded-lg font-bold text-lg pointer-events-none opacity-75',
              disabled: true,
            }),
          );
        } else {
          ctaGroup.append(
            createLink({
              href: '/leagues/',
              text: 'View Leagues',
              className: 'btn-primary text-xl py-4 px-10',
            }),
          );
        }
      }
    };

    updateHomeHero();

    // Update all elements with registration CTA markers
    document.querySelectorAll('[data-cta-type]').forEach((el) => {
      const type = el.getAttribute('data-cta-type');

      if (type === 'register-now') {
        if (regStatus === 'open') {
          el.textContent = 'Register Now';
          el.href = REG_PAGE;
          el.target = '_blank';
          el.rel = 'noopener noreferrer';
          el.classList.remove('pointer-events-none', 'opacity-75');
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
      // Show "Sign Up" whenever registration is open - including a late-open
      // league during an in-progress season (hasOpenRegistration).
      if (regStatus === 'open' || hasOpenRegistration) {
        const external = regStatus === 'open' || openRegIsExternal;
        headerCTA.textContent = 'Sign Up';
        headerCTA.href = regStatus === 'open' ? REG_PAGE : (openRegUrl || '/leagues/');
        if (external) {
          headerCTA.target = '_blank';
          headerCTA.rel = 'noopener noreferrer';
        } else {
          headerCTA.removeAttribute('target');
          headerCTA.removeAttribute('rel');
        }
        headerCTA.classList.remove('pointer-events-none', 'opacity-75');
      } else if (regStatus === 'coming-soon') {
        headerCTA.textContent = 'Coming Soon';
        headerCTA.href = '#';
        headerCTA.classList.add('pointer-events-none', 'opacity-75');
      } else {
        headerCTA.textContent = 'View Leagues';
        headerCTA.href = '/leagues/';
        headerCTA.removeAttribute('target');
        headerCTA.removeAttribute('rel');
        headerCTA.classList.remove('pointer-events-none', 'opacity-75');
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
