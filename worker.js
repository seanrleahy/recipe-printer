const MAX_HTML_BYTES = 3_000_000;
const USER_AGENT = "RecipePrinter/1.0 (+recipe extraction)";

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    if (requestUrl.pathname !== "/api/recipe") {
      return env.ASSETS.fetch(request);
    }
    const url = new URL(request.url);
    if (url.pathname === "/api/recipe" && request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    if (url.pathname !== "/api/recipe" || request.method !== "POST") {
      return new Response("Not found", { status: 404 });
    }

    try {
      const body = await request.json();
      const target = validatePublicUrl(body.url);
      const html = await fetchHtmlSafely(target);
      const recipe = extractRecipe(html);
      if (!recipe) {
        return json({ error: "We couldn't find structured recipe data on that page. Try another recipe website." }, 422);
      }
      return json({ recipe });
    } catch (error) {
      return json({ error: error.message || "Unable to retrieve that recipe." }, 400);
    }
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders() }
  });
}

function validatePublicUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("Please enter a valid webpage URL."); }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only http and https recipe URLs are supported.");
  if (parsed.username || parsed.password) throw new Error("URLs containing login credentials are not supported.");
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      host === "0.0.0.0" || host === "::1" || host.startsWith("127.") ||
      host.startsWith("10.") || host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.startsWith("169.254.")) {
    throw new Error("That address is not supported.");
  }
  return parsed;
}

async function fetchHtmlSafely(startUrl) {
  let current = startUrl;
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetch(current.toString(), {
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml" }
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("Location");
      if (!location) throw new Error("The recipe website redirected unexpectedly.");
      current = validatePublicUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`The recipe website returned an error (${response.status}).`);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html") && !type.includes("application/xhtml+xml")) {
      throw new Error("That link does not appear to be an HTML webpage.");
    }
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_HTML_BYTES) throw new Error("That webpage is too large to process.");
    const html = await response.text();
    if (html.length > MAX_HTML_BYTES) throw new Error("That webpage is too large to process.");
    return html;
  }
  throw new Error("Too many redirects from that recipe website.");
}

function extractRecipe(html) {
  const scripts = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const candidates = [];
  for (const match of scripts) {
    try {
      const parsed = JSON.parse(match[1].replace(/^\s*<!--|-->\s*$/g, ""));
      collectRecipes(parsed, candidates);
    } catch { /* Ignore malformed JSON-LD blocks. */ }
  }
  if (!candidates.length) return null;
  const item = candidates.sort((a, b) => scoreRecipe(b) - scoreRecipe(a))[0];
  const instructions = flattenInstructions(item.recipeInstructions || []);
  return {
    name: clean(item.name),
    recipeYield: clean(item.recipeYield),
    prepTime: formatDuration(item.prepTime),
    cookTime: formatDuration(item.cookTime),
    totalTime: formatDuration(item.totalTime),
    recipeIngredient: Array.isArray(item.recipeIngredient) ? item.recipeIngredient.map(clean).filter(Boolean) : [],
    recipeIngredientSections: extractIngredientSections(item, html),
    recipeInstructions: instructions,
  };
}
function extractIngredientSections(item, html) {
 const plain = String(html).replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<\/(?:h[1-6]|p|li|ul|ol|div|section|article|br)\s*>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&rsquo;|&#8217;/gi, "'").replace(/\s+/g, " ");
 const normal = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
 const text = normal(plain);
 const end = text.lastIndexOf("instructions");
 const start = text.lastIndexOf("ingredients", end < 0 ? text.length : end);
 if (start < 0) return [];
 const stop = end < 0 ? text.length : end;
 const names = ["Chicken Marinade Ingredients","Chicken Marinade","Ingredients for Seasoned Flour Mixture to Bread Chicken","Flour Mixture for Breading Chicken","Toppings","Crispy Chicken Burger Sauce","Breadcrumb"];
 const headings = names.map(name => ({name, at:text.indexOf(normal(name),start+11)})).filter(x=>x.at>=0&&x.at<stop).sort((a,b)=>a.at-b.at);
 if (!headings.length) return [];
 const ingredients = (item.recipeIngredient || []).map(clean).filter(Boolean);
 const groups=[]; let current={name:"",ingredients:[]}; let h=0; let searchFrom=start+11;
 for (const ingredient of ingredients) {
   const key=normal(ingredient);
   const at=key.length>3?text.indexOf(key,searchFrom):-1;
   if(at>=0) searchFrom=at+key.length;
   while(at>=0&&h<headings.length&&headings[h].at<at) {
     if(current.ingredients.length) groups.push(current);
     current={name:headings[h].name,ingredients:[]}; h++;
   }
   current.ingredients.push(ingredient);
 }
 if(current.ingredients.length) groups.push(current);
 return groups.length>1 ? groups : [];
}
function collectRecipes(node, output) {
  if (!node) return;
  if (Array.isArray(node)) { node.forEach(x => collectRecipes(x, output)); return; }
  if (typeof node !== "object") return;
  const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
  if (types.some(t => String(t).toLowerCase() === "recipe")) output.push(node);
  if (node["@graph"]) collectRecipes(node["@graph"], output);
  for (const [key, value] of Object.entries(node)) {
    if (key !== "@graph" && value && typeof value === "object") collectRecipes(value, output);
  }
}
function scoreRecipe(item) {
  return (item.name ? 2 : 0) + (item.recipeIngredient?.length ? 4 : 0) +
    (item.recipeInstructions ? 4 : 0) + (item.recipeYield ? 1 : 0);
}
function flattenInstructions(value) {
  const result = [];
  const visit = item => {
    if (typeof item === "string") { if (clean(item)) result.push(clean(item)); return; }
    if (Array.isArray(item)) { item.forEach(visit); return; }
    if (item && typeof item === "object") {
      if (item.text) visit(item.text);
      else if (item.name && item.itemListElement) visit(item.itemListElement);
      else if (item.itemListElement) visit(item.itemListElement);
    }
  };
  visit(value);
  return result;
}
function clean(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(clean).filter(Boolean).join(", ");
  if (typeof value === "object") return clean(value.name || value.text || "");
  return String(value).replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}
function formatDuration(value) {
  if (!value) return "";
  const match = String(value).match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!match) return clean(value);
  const parts = [];
  if (match[1]) parts.push(`${match[1]} day${match[1] === "1" ? "" : "s"}`);
  if (match[2]) parts.push(`${match[2]} hr`);
  if (match[3]) parts.push(`${match[3]} min`);
  if (match[4]) parts.push(`${match[4]} sec`);
  return parts.join(" ") || "";
}
