const API_ENDPOINT = "/api/recipe";
const APP_URL = "https://recipe-printer.seanleahy-cf3.workers.dev/";

const form = document.querySelector("#recipe-form");
const urlInput = document.querySelector("#recipe-url");
const convertButton = document.querySelector("#convert-button");
const statusEl = document.querySelector("#status");
const browserFallback = document.querySelector("#browser-fallback");
const entry = document.querySelector("#entry");
const recipeView = document.querySelector("#recipe-view");
const imageInput = document.querySelector("#recipe-images");
const ocrStatus = document.querySelector("#ocr-status");
const ocrReview = document.querySelector("#ocr-review");

function setStatus(message, isSuccess = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("success", isSuccess);
}
function addMeta(label, value) {
  if (!value) return null;
  const item = document.createElement("div");
  item.className = "meta-item";
  const key = document.createElement("span");
  key.className = "meta-label";
  key.textContent = label;
  const val = document.createElement("span");
  val.className = "meta-value";
  val.textContent = value;
  item.append(key, val);
  return item;
}
function normaliseInstructions(instructions) {
  if (!Array.isArray(instructions)) return [];
  const output = [];
  for (const item of instructions) {
    if (typeof item === "string") {
      if (item.trim()) output.push(item.trim());
    } else if (item && typeof item === "object") {
      if (item.text) output.push(String(item.text).trim());
      else if (Array.isArray(item.itemListElement)) output.push(...normaliseInstructions(item.itemListElement));
    }
  }
  return output.filter(Boolean);
}
function durationText(value) {
  if (!value) return "";
  const match = String(value).match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/i);
  if (!match) return String(value);
  return [match[1] && match[1] + " hr", match[2] && match[2] + " min"].filter(Boolean).join(" ");
}
function renderRecipe(recipe) {
  document.querySelector("#recipe-title").textContent = recipe.name || "Untitled recipe";
  const meta = document.querySelector("#recipe-meta");
  meta.replaceChildren();
  const prep = durationText(recipe.prepTime);
  const cook = durationText(recipe.cookTime);
  const total = durationText(recipe.totalTime);
  const yieldText = Array.isArray(recipe.recipeYield) ? recipe.recipeYield.join(", ") : recipe.recipeYield || "";
  [addMeta("Serves", yieldText), addMeta("Prep time", prep), addMeta("Cook time", cook || total)].filter(Boolean).forEach(x => meta.append(x));
  const ingredients = Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : [];
  const printableRecipe = document.querySelector("#printable-recipe");
  printableRecipe.classList.toggle("many-ingredients", ingredients.length >= 18);
  const ingredientList = document.querySelector("#ingredient-list");
  ingredientList.replaceChildren();
  ingredients.forEach(text => {
    const li = document.createElement("li");
    li.textContent = text;
    ingredientList.append(li);
  });
  const instructions = normaliseInstructions(recipe.recipeInstructions || []);
  const instructionList = document.querySelector("#instruction-list");
  instructionList.replaceChildren();
  instructions.forEach(text => {
    const li = document.createElement("li");
    li.textContent = text;
    instructionList.append(li);
  });
  entry.hidden = true;
  ocrReview.hidden = true;
  recipeView.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;
  try { new URL(url); } catch {
    setStatus("Please enter a complete webpage URL, including https://");
    return;
  }
  convertButton.disabled = true;
  convertButton.textContent = "Extracting recipe…";
  browserFallback.hidden = true;
  setStatus("Reading the recipe page. This can take a few seconds.");
  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url })
    });
    const data = await response.json();
    if (!response.ok) { const error = new Error(data.error || "We couldn't read that recipe page."); error.status = response.status; throw error; }
    if (!data.recipe) throw new Error("No structured recipe was found on that page.");
    renderRecipe(data.recipe);
    setStatus("");
  } catch (error) {
    const blockedBySite = error.status === 403 || /403|forbidden|blocked the request/i.test(error.message || "");
    if (blockedBySite) { browserFallback.hidden = false; setStatus("This site is blocking automatic import. Use the browser-page helper below instead."); }
    else { setStatus(error.message || "Something went wrong. Please try another recipe URL."); }
  } finally {
    convertButton.disabled = false;
    convertButton.innerHTML = 'Make it printable <span aria-hidden="true">→</span>';
  }
});
document.querySelector("#open-blocked-page").addEventListener("click", () => { const url = urlInput.value.trim(); if (url) window.open(url, "_blank", "noopener"); });
document.querySelector("#print-button").addEventListener("click", () => window.print());
document.querySelector("#back-button").addEventListener("click", () => {
  recipeView.hidden = true;
  entry.hidden = false;
  setStatus("");
  browserFallback.hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// A bookmarklet runs on the recipe page itself, so it can read structured data
// even when that site's server blocks requests from the printer.
const browserHelper = 'javascript:(()=>{const out=[];const walk=x=>{if(!x)return;if(Array.isArray(x)){x.forEach(walk);return}if(typeof x!=="object")return;const t=Array.isArray(x["@type"])?x["@type"]:[x["@type"]];if(t.some(v=>String(v).toLowerCase()==="recipe"))out.push(x);Object.values(x).forEach(v=>{if(v&&typeof v==="object")walk(v)})};document.querySelectorAll(\'script[type="application/ld+json"]\').forEach(s=>{try{walk(JSON.parse(s.textContent))}catch(e){}});if(!out.length){alert("No recipe data was found on this page. Try a page with a full recipe card.");return}const r=out.sort((a,b)=>(b.recipeIngredient?.length||0)-(a.recipeIngredient?.length||0))[0];const data={name:r.name||document.title,recipeYield:r.recipeYield||"",prepTime:r.prepTime||"",cookTime:r.cookTime||"",totalTime:r.totalTime||"",recipeIngredient:r.recipeIngredient||[],recipeInstructions:r.recipeInstructions||[]};if(!data.recipeIngredient.length||!data.recipeInstructions.length){alert("The page did not expose a complete recipe card. You can try uploading screenshots instead.");return}location.href="' + APP_URL + '#import="+encodeURIComponent(JSON.stringify(data))})()';
document.querySelector("#copy-import-helper").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(browserHelper);
    document.querySelector("#copy-import-helper").textContent = "Copied — add it as a bookmark";
  } catch {
    const area = document.createElement("textarea");
    area.value = browserHelper;
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    document.querySelector("#copy-import-helper").textContent = "Copied — add it as a bookmark";
  }
});

// Import recipe JSON passed back by the browser bookmarklet.
function importFromHash() {
  if (!location.hash.startsWith("#import=")) return;
  try {
    const recipe = JSON.parse(decodeURIComponent(location.hash.slice(8)));
    if (!recipe || !Array.isArray(recipe.recipeIngredient)) throw new Error("Invalid recipe");
    renderRecipe(recipe);
    history.replaceState(null, "", location.pathname + location.search);
  } catch {
    setStatus("The browser helper could not import that recipe. Please try again or upload a photo.");
  }
}
importFromHash();

// OCR is loaded only when the user selects photos. The image files stay in this browser.
function loadOcrLibrary() {
  if (window.Tesseract) return Promise.resolve();
  if (window.ocrLibraryPromise) return window.ocrLibraryPromise;
  window.ocrLibraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load the photo text reader. Check your internet connection and try again."));
    document.head.append(script);
  });
  return window.ocrLibraryPromise;
}
function splitRecognisedText(text) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const ingredientStart = lines.findIndex(line => /^(ingredients?|you will need)\b\s*:?$/i.test(line));
  const methodStart = lines.findIndex(line => /^(method|instructions?|directions|preparation|to make)\b\s*:?$/i.test(line));
  const title = lines.find((line, index) => index < (ingredientStart >= 0 ? ingredientStart : lines.length) && !/^(serves?|makes?|prep|cook|total)\b/i.test(line)) || "";
  let ingredientLines = [];
  let methodLines = [];
  if (ingredientStart >= 0) {
    ingredientLines = lines.slice(ingredientStart + 1, methodStart > ingredientStart ? methodStart : lines.length);
  }
  if (methodStart >= 0) methodLines = lines.slice(methodStart + 1);
  if (ingredientStart < 0 && methodStart < 0) {
    ingredientLines = lines.filter(line => line !== title && !/^(serves?|makes?|prep|cook|total)\b/i.test(line));
  }
  ingredientLines = ingredientLines.filter(line => !/^(method|instructions?|directions|preparation)\b/i.test(line));
  const serves = (text.match(/(?:serves?|makes?)\s*:?\s*([^\n]+)/i) || [])[1] || "";
  const prep = (text.match(/prep(?:aration)?\s*time\s*:?\s*([^\n]+)/i) || [])[1] || "";
  const cook = (text.match(/cook(?:ing)?\s*time\s*:?\s*([^\n]+)/i) || [])[1] || "";
  return { title, ingredients: ingredientLines.join("\n"), method: methodLines.join("\n"), serves: serves.trim(), prep: prep.trim(), cook: cook.trim() };
}
imageInput.addEventListener("change", async () => {
  const files = Array.from(imageInput.files || []);
  if (!files.length) return;
  imageInput.disabled = true;
  ocrStatus.textContent = "Loading the photo text reader…";
  ocrReview.hidden = true;
  let worker;
  try {
    await loadOcrLibrary();
    worker = await Tesseract.createWorker("eng", 1, { logger: message => {
      if (message.status === "recognizing text") ocrStatus.textContent = "Reading photo " + (message.progress * 100).toFixed(0) + "%…";
      else if (message.status) ocrStatus.textContent = message.status + "…";
    }});
    let combined = "";
    for (let i = 0; i < files.length; i++) {
      ocrStatus.textContent = "Reading photo " + (i + 1) + " of " + files.length + "…";
      const result = await worker.recognize(files[i]);
      combined += "\n" + result.data.text + "\n";
    }
    const parsed = splitRecognisedText(combined);
    document.querySelector("#ocr-title").value = parsed.title;
    document.querySelector("#ocr-ingredients").value = parsed.ingredients;
    document.querySelector("#ocr-method").value = parsed.method;
    document.querySelector("#ocr-serves").value = parsed.serves;
    document.querySelector("#ocr-prep").value = parsed.prep;
    document.querySelector("#ocr-cook").value = parsed.cook;
    ocrReview.hidden = false;
    ocrStatus.textContent = "Text recognised. Please review it below before printing.";
    ocrReview.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    ocrStatus.textContent = error.message || "We couldn't read those images.";
  } finally {
    if (worker) await worker.terminate();
    imageInput.disabled = false;
  }
});
document.querySelector("#make-from-photos").addEventListener("click", () => {
  const ingredients = document.querySelector("#ocr-ingredients").value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const instructions = document.querySelector("#ocr-method").value.split(/\n\s*\n|\r?\n/).map(x => x.trim()).filter(Boolean);
  if (!ingredients.length || !instructions.length) {
    ocrStatus.textContent = "Please add at least one ingredient and one method step before continuing.";
    return;
  }
  renderRecipe({
    name: document.querySelector("#ocr-title").value.trim(),
    recipeYield: document.querySelector("#ocr-serves").value.trim(),
    prepTime: document.querySelector("#ocr-prep").value.trim(),
    cookTime: document.querySelector("#ocr-cook").value.trim(),
    recipeIngredient: ingredients,
    recipeInstructions: instructions
  });
});
