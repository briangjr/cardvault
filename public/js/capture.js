// ---------------------------------------------------------------------------
// Image capture helpers: previewing a chosen file, and producing a resized
// base64 copy sized for sending to the AI (keeps the request fast & under
// Netlify's function payload limit) while the ORIGINAL full-resolution file
// is what actually gets stored in your inventory.
// ---------------------------------------------------------------------------
const Capture = (() => {
  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Returns { base64, mediaType } downscaled to maxDim on the long edge.
  async function resizeForAI(file, maxDim = 1600, quality = 0.88) {
    const dataUrl = await readAsDataURL(file);
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = dataUrl;
    });

    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      if (width >= height) {
        height = Math.round((height / width) * maxDim);
        width = maxDim;
      } else {
        width = Math.round((width / height) * maxDim);
        height = maxDim;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);

    const resizedDataUrl = canvas.toDataURL("image/jpeg", quality);
    const base64 = resizedDataUrl.split(",")[1];
    return { base64, mediaType: "image/jpeg" };
  }

  return { readAsDataURL, resizeForAI };
})();
