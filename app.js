const API_ENDPOINT = "/api/recipe";

const form = document.querySelector("#recipe-form");
const urlInput = document.querySelector("#recipe-url");
const convertButton = document.querySelector("#convert-button");
const statusEl = document.querySelector("#status");
const entry = document.querySelector("#entry");
const recipeView = document.querySelector("#recipe-view");

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
function renderRecipe(recipe, sourceUrl) {
  document.querySelector("#recipe-title").textContent = recipe.name || "Untitled recipe";
  document.querySelector("#recipe-category").textContent = recipe.recipeCategory || recipe.recipeCuisine || "RECIPE";
  document.querySelector("#recipe-description").textContent = recipe.description || "";
  const meta = document.querySelector("#recipe-meta");
  meta.replaceChildren();
  const prep = recipe.prepTime || "";
  const cook = recipe.cookTime || "";
  const total = recipe.totalTime || "";
  const yieldText = recipe.recipeYield || "";
  [addMeta("Serves", yieldText), addMeta("Prep time", prep), addMeta("Cook time", cook || total)].filter(Boolean).forEach(x => meta.append(x));
  const story = recipe.story || "";
  document.querySelector("#story-section").hidden = !story;
  document.querySelector("#recipe-story").textContent = story;

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
  document.querySelector("#recipe-author").textContent = recipe.author ? `By ${recipe.author}` : "";
  const source = document.querySelector("#recipe-source");
  source.textContent = "Source: " + new URL(sourceUrl).hostname;
  entry.hidden = true;
  recipeView.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;
  try {
    new URL(url);
  } catch {
    setStatus("Please enter a complete webpage URL, including https://");
    return;
  }
  convertButton.disabled = true;
  convertButton.textContent = "Extracting recipe…";
  setStatus("Reading the recipe page. This can take a few seconds.");
  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "We couldn't read that recipe page.");
    if (!data.recipe) throw new Error("No structured recipe was found on that page.");
    renderRecipe(data.recipe, url);
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Something went wrong. Please try another recipe URL.");
  } finally {
    convertButton.disabled = false;
    convertButton.innerHTML = 'Make it printable <span aria-hidden="true">→</span>';
  }
});
document.querySelector("#print-button").addEventListener("click", () => window.print());
document.querySelector("#back-button").addEventListener("click", () => {
  recipeView.hidden = true;
  entry.hidden = false;
  setStatus("");
  window.scrollTo({ top: 0, behavior: "smooth" });
});
