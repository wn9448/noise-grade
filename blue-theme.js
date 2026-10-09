// Use the bill's blue for graphics and preserve the original neutral text.
(() => {
  const image = document.querySelector('img');
  const blue = [46, 48, 146];

  function applyBlueTheme() {
    try {
      const canvas = document.createElement('canvas');
      // Three pixels per displayed pixel keeps text sharp without decoding a
      // second full-size 63-megapixel buffer on mobile devices.
      canvas.width = Math.min(image.naturalWidth, 1179);
      canvas.height = Math.round(image.naturalHeight * canvas.width / image.naturalWidth);
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', image.alt);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const frame = context.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = frame.data;

      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const chroma = max - min;
        // Identify the original red accents so their replacements use solid blue.
        const isRed = chroma > 20 && r === max && (g - b) / chroma < 0.32;
        const x = ((i / 4) % canvas.width) / canvas.width;
        const y = Math.floor(i / 4 / canvas.width) / canvas.height;
        // Keep the complete gauge artwork in its original five-color palette,
        // including the green number, explanation, and pale green semicircle.
        const isGauge = x > 0.09 && x < 0.91 && y > 0.30 && y < 0.49;
        if (isGauge) continue;
        // Both pulse symbols belong to the blue wordmark, not the red data highlights.
        const isLogo = (x > 0.64 && x < 0.92 && y > 0.09 && y < 0.17)
          || (x > 0.30 && x < 0.45 && y > 0.89 && y < 0.94);
        const isChart = y > 0.62 && y < 0.81;
        const isIntroText = x > 0.07 && x < 0.55 && y > 0.09 && y < 0.17;
        const isBanner = y > 0.20 && y < 0.27;
        // Restore original black/gray lettering directly from the source.
        if (chroma < 18 && min < 220) continue;
        const replaceRed = isRed && (isLogo || isChart || isIntroText || isBanner);
        const ink = Math.min(1, (255 - min) / (255 - (replaceRed ? 80 : blue[0])));
        for (let channel = 0; channel < 3; channel++) {
          pixels[i + channel] = Math.round(255 - (255 - blue[channel]) * ink);
        }
      }

      context.putImageData(frame, 0, 0);
      image.replaceWith(canvas);
    } catch (error) {
      // Retain the readable original if canvas is unavailable.
      console.warn('Blue theme could not be applied.', error);
    }
  }

  if (image.complete && image.naturalWidth) applyBlueTheme();
  else image.addEventListener('load', applyBlueTheme, { once: true });
})();
