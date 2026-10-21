// Small touches; the page works fully without this script.
document.documentElement.classList.add('js');

// A border under the header once the page scrolls.
// (Not called "top": in a classic script that clashes with window.top.)
const header = document.querySelector('.top');
const onScroll = () => header?.classList.toggle('scrolled', window.scrollY > 8);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Sections fade in as they come into view.
const reveal = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        reveal.unobserve(entry.target);
      }
    }
  },
  { rootMargin: '0px 0px -10% 0px' },
);
for (const el of document.querySelectorAll('.feature, .card, .privacy li, .steps li, .price')) {
  el.classList.add('reveal');
  reveal.observe(el);
}

// The webinar loads from YouTube (privacy-enhanced mode) only after a click.
for (const button of document.querySelectorAll('button[data-youtube]')) {
  button.addEventListener('click', () => {
    const frame = document.createElement('iframe');
    frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(button.dataset.youtube)}?autoplay=1&rel=0`;
    frame.title = button.dataset.title;
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    button.replaceWith(frame);
    frame.focus();
  });
}
