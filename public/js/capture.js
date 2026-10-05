// ---------------------------------------------------------------------------
// Image capture helpers: previewing a chosen file, and producing resized
// copies — a small one for the AI (keeps the request fast & under Netlify's
// function payload limit), and a larger-but-still-capped one for what
// actually gets stored in your inventory. Storing a capped size instead of
// the raw phone photo (which can be 5-12MB) makes uploads far less likely
// to fail on a slow or unstable connection, while still looking sharp.
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

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = dataUrl;
    });
  }

  function scaledCanvas(img, maxDim) {
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
    return canvas;
  }

  // Returns { base64, mediaType } downscaled to maxDim on the long edge —
  // used for the identify/refresh AI calls.
  async function resizeForAI(file, maxDim = 1600, quality = 0.88) {
    const dataUrl = await readAsDataURL(file);
    const img = await loadImage(dataUrl);
    const canvas = scaledCanvas(img, maxDim);
    const resizedDataUrl = canvas.toDataURL("image/jpeg", quality);
    const base64 = resizedDataUrl.split(",")[1];
    return { base64, mediaType: "image/jpeg" };
  }

  // Returns a File (still high quality, just capped in size) — used for what
  // gets uploaded to Supabase Storage and kept in your inventory long-term.
  async function resizeForStorage(file, maxDim = 2200, quality = 0.92, filename = "photo.jpg") {
    const dataUrl = await readAsDataURL(file);
    const img = await loadImage(dataUrl);
    const canvas = scaledCanvas(img, maxDim);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return new File([blob], filename, { type: "image/jpeg" });
  }

  return { readAsDataURL, resizeForAI, resizeForStorage };
})();
