# RECOVER — image asset and generation prompt plan

This plan is based on a visual and route audit of `https://recover.btcpay.exchange/` and the current React app. The public site currently contains a navigation bar, hero, proof band, three-step explainer, integration band, ROI calculator, pricing section, final CTA and footer. The app contains the overview dashboard, opportunity list/detail, workflows, messages, integrations, settings, billing, team placeholder, sign-up/sign-in, demo checkout and legal pages.

There is no About page, testimonial section, resource/blog section, or dedicated 404 page today. Those assets are grouped under **Future sections** so they are not mistaken for live content. The Team route is currently a placeholder and should get real team functionality before it gets decorative artwork.

The existing interface is already built from native HTML, CSS, SVG and Recharts. Preserve that for real metrics, charts, tables, forms, workflow diagrams and controls. The strongest visual upgrade is a small family of carefully art-directed 3D scenes and refined empty-state illustrations around real product UI. Do not generate fake UI text, customer logos, testimonials, or revenue figures.

## 1. Master visual system

### Brand palette

| Color | Hex | Use |
|---|---:|---|
| Mist | `#F7F8FB` | Main light canvas and light-scene backgrounds |
| White | `#FFFFFF` | UI surfaces and clean negative space |
| Ink | `#17212F` | Primary type, dark pricing surface, trust anchor |
| Slate | `#8290A0` | Secondary labels and low-contrast structure |
| RECOVER violet | `#7058E8` | Discovery, signals, primary data path |
| RECOVER mint | `#B8F36B` | Verified recovery, success, payment confirmation |
| Warm accent | `#F8AE7B` | Small secondary signals only; never dominant |

Keep violet and mint as restrained signal colors. Most pixels should be mist, white, or ink. Maintain WCAG contrast in the actual page UI; artwork must never carry essential meaning or text.

### Visual motif

Show fragmented business records becoming one clear, verified path: small ledger-like planes, structured data tiles, fine signal rails and concentric calibration rings. The path enters in violet and resolves in mint. Use the motif to communicate discovery, review and confirmed recovery. It should feel like precise financial infrastructure, not a money-printing machine.

### Rendering direction

- Premium editorial 3D product illustration; physically based rendering with accurate material response.
- Satin ceramic, clear optical glass, frosted glass used sparingly, and brushed titanium details. Avoid generic glassmorphism panels.
- Soft studio key light from upper left, quiet rim light, subtle ambient occlusion, low bloom and clean shadow falloff.
- Precise geometry, restrained depth, slight isometric or three-quarter camera, no fisheye lens.
- Calm, stable, deliberate composition. Place the visual mass away from copy and leave at least 35% usable negative space.
- Match light and dark scenes to their actual surface: light mist for the landing page; ink/navy for proof and pricing sections.
- All generated artwork is textless. Add all RECOVER copy, metrics, labels and UI using the real application.

### Reusable prompt prefix

Use this prefix verbatim for the scene prompts below, followed by the asset-specific scene description:

> High-end editorial 3D product illustration for RECOVER, a trusted enterprise revenue-recovery platform. Use the RECOVER visual system: warm near-white mist `#F7F8FB`, deep ink `#17212F`, restrained violet `#7058E8` and mint `#B8F36B`; satin ceramic, optical glass and finely brushed titanium; physically based rendering; soft upper-left studio key light, delicate rim light, subtle ambient occlusion, controlled highlights and low bloom. Precise financial-infrastructure geometry, calm boardroom-ready confidence, quietly futuristic, slightly isometric three-quarter camera, generous clean negative space, sophisticated art direction, crisp silhouette, premium materials, no visual clutter.

### Universal negative prompt

Append this in the generator’s negative-prompt field for every generated image:

> text, letters, numbers, charts with labels, currency symbols, dollar signs, coins, banknotes, cash piles, money rain, piggy banks, robot, humanoid AI, brain, circuit-board cliché, cyberpunk city, neon glow, purple laser, blockchain chain links, crypto token, glass dashboard UI, fake app screen, fake customer logo, watermark, signature, stock-photo handshake, fake people, exaggerated lens flare, oversaturated gradients, noisy particles, busy background, low contrast, childish mascot, cartoon, clip art.

### Export and delivery rules

- Put web assets under `apps/web/public/assets/`, grouped into `brand/`, `marketing/`, `product/`, `states/`, `social/` and `future/`.
- Use AVIF or WebP for opaque raster artwork; use transparent WebP or PNG when the art must sit over live UI. Provide 1x/2x responsive sources where useful.
- Aim for under 250 KB for most in-page illustrations and under 400 KB for large hero art. Use `srcset` and lazy loading below the fold.
- Export vectors as SVG. Brand marks and vendor logos must be authored or sourced as real vectors, never diffusion-generated.
- Keep the subject inside a 10% crop-safe margin. Deliver light and dark variants only when they are actually used on both surfaces.
- Do not bake the $84,219 / $17,430 figures into artwork. The live UI owns those numbers and the demo state must remain clearly labeled.

## 2. Live marketing site — top to bottom

### 2.1 RECOVER brand mark and wordmark

**Asset:** `apps/web/public/assets/brand/recover-mark.svg`, `recover-wordmark-dark.svg`, `recover-wordmark-light.svg`  
**Location:** Header, app sidebar, auth pages, footer, payment page.  
**Purpose:** Replace the current CSS-built three-bar mark with one precise, reusable vector. Maintain strong contrast on mist and ink surfaces.  
**Format and dimensions:** SVG source; mark viewBox equivalent to 64×64; wordmark lockups equivalent to 240×64.  
**Prompt / design brief:** Do not generate a raster logo. Draw a simple vector symbol from three ascending, slightly forward-leaning rounded bars. Use violet for the first two bars and mint for the third. Pair with a lowercase geometric sans wordmark, `recover`, in ink or white. Keep the silhouette recognizable at 16 px. No gradients, glow, coin, arrow, or extra icon. Deliver mark-only plus dark and light wordmark lockups.

### 2.2 Landing hero — revenue signal sculpture

**Asset:** `apps/web/public/assets/marketing/hero-revenue-signal.webp`  
**Location:** Above the fold, behind and around the native mini-dashboard on the right.  
**Purpose:** Give the hero a memorable signature image while the actual dashboard card remains legible and truthful. Communicate that RECOVER connects overlooked signals and resolves them into verified value.  
**Format and dimensions:** Transparent WebP, 1800×1350, 4:3; provide 1200×900 fallback. Keep the strongest form on the far right and lower edge so it frames the card rather than competing with it.  
**Generation prompt:**  
> [Reusable prompt prefix] Create a floating, sculptural revenue signal: several thin, precise ledger planes and a handful of small data tiles enter from the left, travel along two violet signal rails, and converge through one large, clear optical-glass calibration ring. The far side resolves into one clean mint segment and a small abstract verification notch. Three-quarter camera, balanced asymmetry, mostly transparent negative space in the center for a real dashboard card to overlay, light mist environment, edges softly lit, restrained shadows, enterprise financial infrastructure, no literal money.

### 2.3 Hero product preview — authentic UI capture

**Asset:** `apps/web/public/assets/marketing/hero-dashboard-preview.webp`  
**Location:** Hero mini-dashboard; use on narrower breakpoints or for external campaign layouts.  
**Purpose:** Show a credible product surface, not a generated imitation. Keep the hero figures, real chart and opportunity row in sync with the demo workspace.  
**Format and dimensions:** Capture the actual app component at 1440×1050 and export 2x as WebP; crop a 16:10 and a 4:3 variant.  
**Prompt / capture brief:** Do not use an image generator. Capture the real RECOVER overview UI with demo badge visible, high-contrast figures, one real chart and one opportunity row. Hide browser chrome and cursor. Use a neutral white/mist page background and a restrained 18 px shadow. Never redraw UI text inside an image.

### 2.4 Proof band — quiet signal field

**Asset:** `apps/web/public/assets/marketing/proof-band-field.svg`  
**Location:** Dark horizontal band under the hero.  
**Purpose:** Add depth behind the existing demo proof while preserving its readability and the explicit demo label.  
**Format and dimensions:** SVG pattern, 2400×320 viewBox, low-opacity strokes.  
**Prompt / design brief:** Create a subtle vector field of fine parallel data rails, tiny node intersections and a single violet-to-mint path. Keep all geometry below 8% opacity over ink `#17212F`; no text, numbers or currency icon. It should read as instrument calibration when noticed and as a quiet texture at first glance. Prefer CSS/SVG over a generated bitmap.

### 2.5 “How it works” — three-step illustration family

These replace or sit beside the current 20 px step icons. Keep their light source, scale, camera and ring motif identical. Export each as transparent WebP so the cards remain responsive.

#### A. Find the follow-up gap

**Asset:** `apps/web/public/assets/marketing/step-find-signals.webp`  
**Location:** Step 01 card.  
**Purpose:** Show records from several business systems coming into view, without implying broad or unrestricted access.  
**Format and dimensions:** Transparent WebP, 900×900, square.  
**Generation prompt:**  
> [Reusable prompt prefix] A small, elegant cluster of five distinct record tiles representing a quote, missed call, invoice, subscription and cart, orbiting a single quiet violet scanning ring. Each tile has only abstract lines and one tiny source dot; no readable text, no vendor marks. The scan reveals a few overlooked mint-free signal points. Light mist background, isometric three-quarter view, crisp and calm, generous transparent margin.

#### B. Make the next move clear

**Asset:** `apps/web/public/assets/marketing/step-prioritize-review.webp`  
**Location:** Step 02 card.  
**Purpose:** Show context-aware prioritization and a human reviewing the proposed next step.  
**Format and dimensions:** Transparent WebP, 900×900, square.  
**Generation prompt:**  
> [Reusable prompt prefix] One opportunity tile moves to the front of a tidy three-layer queue. A clear violet focus frame surrounds it; beside it, a small physical approval switch is visibly in the human-review position, with one restrained mint indicator ready but not yet confirmed. Represent human oversight without depicting a person. Light mist background, clean isometric composition, simple forms, generous transparent margin.

#### C. Recover with confidence

**Asset:** `apps/web/public/assets/marketing/step-confirm-recovery.webp`  
**Location:** Step 03 card.  
**Purpose:** Communicate an approved follow-up followed by confirmed payment and attribution.  
**Format and dimensions:** Transparent WebP, 900×900, square.  
**Generation prompt:**  
> [Reusable prompt prefix] A violet follow-up path passes through a clear approval gate and resolves into one mint verification ring around a small abstract payment receipt tile. The ring closes cleanly; no dollar sign, card brand or currency. Three-quarter isometric view, premium physical materials, one decisive but quiet success moment, light mist environment, generous transparent margin.

### 2.6 Integration band — actual partner marks

**Assets:** `apps/web/public/assets/brand/integrations/{provider}.svg`  
**Location:** Landing integration cloud and authenticated Integrations screen.  
**Purpose:** Replace the current initials and improvised glyphs with recognizable, accurate vendor marks. This is an important trust signal.  
**Format and dimensions:** SVG from official brand kits or a reviewed icon source; provide 24, 32 and 48 px optical variants.  
**Asset list:** Stripe, HubSpot, Shopify, Twilio, Gmail/Google, Outlook/Microsoft, QuickBooks, Salesforce, Pipedrive, Xero, WooCommerce and BTCPay Server. Use a generic envelope icon for SMTP.  
**Prompt / production brief:** Do not generate vendor logos. Source each current official mark and follow that vendor’s spacing, color and minimum-size rules. Use official color on white surfaces; use a monochrome variant only when the brand kit permits it. Keep provider name as live text outside the SVG. Do not make unsupported integrations appear connected; the existing “+ more” copy remains plain text.

### 2.7 ROI calculator — restrained technical texture

**Asset:** `apps/web/public/assets/marketing/roi-signal-texture.webp`  
**Location:** Behind the left side of the calculator section or as a very faint section edge.  
**Purpose:** Tie the calculator to the signal system while leaving inputs and outputs as accessible, interactive HTML.  
**Format and dimensions:** Opaque AVIF, 1800×1000, wide 9:5 crop; keep the center-left mostly empty.  
**Generation prompt:**  
> [Reusable prompt prefix] A near-white mist surface with barely visible etched ledger contours and three fine violet measurement arcs resolving into a short mint segment at the far right edge. The center remains almost blank for black text and an interactive calculator. Very low contrast, subtle tactile paper-ceramic finish, soft studio light, no cards, no numbers, no interface, no dramatic glow.

### 2.8 Pricing section — precision orbit background

**Asset:** `apps/web/public/assets/marketing/pricing-orbit-background.webp`  
**Location:** Full-bleed dark pricing section behind the copy and pricing card.  
**Purpose:** Give the dark section dimension and connect the base-plan-plus-success-fee story to a measured, traceable system.  
**Format and dimensions:** AVIF, 2400×1300, 16:9; crop-safe, low contrast.  
**Generation prompt:**  
> [Reusable prompt prefix] Reinterpret the scene for a deep ink `#17212F` environment. Fine brushed-titanium orbital paths and thin violet measurement rails move slowly from left to right, with a small mint verification point near the far right edge. Keep the central 65% very dark and low contrast so white copy and a white pricing card remain dominant. Architectural, quiet, financial-infrastructure precision; no literal coins, no text, no glows behind the card.

### 2.9 Final CTA — resolved signal horizon

**Asset:** `apps/web/public/assets/marketing/final-cta-horizon.webp`  
**Location:** Optional shallow background behind “Let’s go find it.”  
**Purpose:** End the landing page with a sense of clarity and forward motion, not a second hero.  
**Format and dimensions:** AVIF, 2000×650, 3:1; low detail behind copy.  
**Generation prompt:**  
> [Reusable prompt prefix] A pale mist horizon with one fine violet path entering from the lower left, crossing a small precise calibration ring and ending in a soft mint point near the upper right. Keep the middle clear for a short headline and CTA. Wide panoramic crop, restrained light, low contrast, confident closure, no horizon landscape, no typography.

### 2.10 Landing footer and section divider

**Assets:** `apps/web/public/assets/brand/signal-divider.svg`, use the wordmark from 2.1.  
**Location:** Above footer and between optional long-form sections.  
**Purpose:** Create a consistent visual cadence without adding large raster files.  
**Format and dimensions:** SVG, 1600×80 viewBox; theme-aware strokes.  
**Prompt / design brief:** Draw one thin violet signal rail that gradually resolves into three short ascending bars, then fades to mint. Use a 1 px base stroke, no blur, no text. It should work at 40 px high and remain decorative to assistive technology.

## 3. Social, browser and app identity

### 3.1 Default Open Graph image

**Asset:** `apps/web/public/assets/social/og-default.webp`  
**Location:** Site-wide `og:image`, X/Twitter card fallback and link previews.  
**Purpose:** Make shared links instantly recognizable and preserve the campaign statement without relying on rendered page screenshots.  
**Format and dimensions:** WebP, 1200×630, 1.91:1.  
**Generation prompt:**  
> [Reusable prompt prefix] Wide social-preview composition on a deep ink field. Place the sculptural violet-to-mint revenue signal on the right third; leave the left 55% clean and nearly uniform for a designer to add the RECOVER wordmark, headline and verified demo label in typeset text. Subtle optical-glass ring, precise tiny ledger planes, restrained light, high contrast at thumbnail size. Do not render any words, numbers, logos or currency.

### 3.2 Dashboard share card

**Asset:** `apps/web/public/assets/social/og-dashboard.webp`  
**Location:** Share links to the demo dashboard.  
**Purpose:** Preview the product with authentic information hierarchy while clearly marking the figures as demo.  
**Format and dimensions:** WebP, 1200×630.  
**Prompt / capture brief:** Capture the actual RECOVER dashboard at desktop width, then compose it inside a browser-free crop on a mist background. Keep the demo badge visible and use the live UI text layer for figures. Add no made-up metric, customer name or label. If the screenshot is not current, omit numbers and use abstract blocks instead.

### 3.3 Favicon and installable app icons

**Assets:** `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, `pwa-192.png`, `pwa-512.png` under `apps/web/public/`.  
**Location:** Browser tab, bookmarks, iOS home screen and installed web app.  
**Purpose:** Maintain recognition at tiny sizes and on both light/dark device surfaces.  
**Format and dimensions:** Vector SVG source; PNG exports 32×32, 180×180, 192×192 and 512×512.  
**Prompt / production brief:** Use the three ascending RECOVER bars from 2.1, centered with generous padding. Use a square rounded-corner mint surface for the app tile and transparent SVG for favicon. No wordmark below 64 px, no dollar sign and no micro-detail.

## 4. Authenticated product surfaces

### 4.1 Overview dashboard — recovery-loop sculpture

**Asset:** `apps/web/public/assets/product/dashboard-recovery-loop.webp`  
**Location:** Right-side illustration inside the overview headline card.  
**Purpose:** Upgrade the current CSS ring and dollar block to a currency-neutral recovery mark while leaving the headline and floating values live in HTML.  
**Format and dimensions:** Transparent WebP, 1200×900, 4:3.  
**Generation prompt:**  
> [Reusable prompt prefix] A compact transparent product sculpture for a white dashboard card: two concentric fine optical-glass rings; one violet route enters the outer ring, passes through a precise review notch and becomes mint on the inner ring. A small faceted ceramic core represents confirmed value without using a currency glyph. Slight three-quarter view, readable at 320 px wide, contained within the right half, soft short shadow, transparent surroundings.

### 4.2 Product UI capture — opportunity detail

**Asset:** `apps/web/public/assets/product/opportunity-detail-preview.webp`  
**Location:** Optional marketing use in product page or sales materials; not a background inside the detail screen.  
**Purpose:** Show the evidence, approval timeline and payment state using real product data.  
**Format and dimensions:** WebP, 1440×1000, 3:2.  
**Prompt / capture brief:** Capture the real opportunity detail screen with synthetic demo contact data only. Show source, evidence panel, consent state, human approval action, message timeline and sandbox payment indicator. Remove browser chrome. Never invent UI copy or expose real customer data.

### 4.3 Empty state — no opportunities

**Asset:** `apps/web/public/assets/states/empty-opportunities.webp`  
**Location:** Opportunity table when a workspace has no detections.  
**Purpose:** Make the first-run state feel intentional and invite a connector setup.  
**Format and dimensions:** Transparent WebP, 800×600, 4:3.  
**Generation prompt:**  
> [Reusable prompt prefix] A tidy, empty optical-glass tray with three faint source rails arriving from the edges and a single violet scan ring waiting in the center. One tiny mint pin remains inactive, indicating that no opportunities have been detected yet. Light background, no text, no currency, generous transparent margins, calm and optimistic rather than celebratory.

### 4.4 Empty state — workflows

**Asset:** `apps/web/public/assets/states/empty-workflows.webp`  
**Location:** Workflows screen before any workflow exists.  
**Purpose:** Explain that a sequence can be configured after data is connected.  
**Format and dimensions:** Transparent WebP, 800×600, 4:3.  
**Generation prompt:**  
> [Reusable prompt prefix] Three small abstract message and review tiles connected by a thin violet path, with one clear empty node ready for the first step. A tiny mint endpoint sits beyond a human-review gate but is not yet active. Precise, uncluttered, light surface, no text, no icons that resemble a real messaging brand.

### 4.5 Empty state — messages

**Asset:** `apps/web/public/assets/states/empty-messages.webp`  
**Location:** Messages screen before the first approved draft.  
**Purpose:** Show an empty audit trail without suggesting outreach happened.  
**Format and dimensions:** Transparent WebP, 800×600, 4:3.  
**Generation prompt:**  
> [Reusable prompt prefix] One pristine, translucent message tile resting beside a quiet violet timeline with no sent marks. A small review gate is visible before the timeline begins. Light background, soft shadows, no envelope logo, no visible message text, no success state.

### 4.6 Empty state — integrations

**Asset:** `apps/web/public/assets/states/empty-integrations.webp`  
**Location:** Integrations screen when no provider is connected.  
**Purpose:** Make the first connection feel secure and reversible.  
**Format and dimensions:** Transparent WebP, 800×600, 4:3.  
**Generation prompt:**  
> [Reusable prompt prefix] Three neutral, unbranded data-source tiles positioned outside a clear secure boundary, with a single violet connector path poised to link them. A quiet shield-shaped silhouette is formed only by negative space, no literal lock icon. Light background, no vendor logos, no text, no connected check marks.

### 4.7 Empty state — billing and usage

**Asset:** `apps/web/public/assets/states/empty-billing.webp`  
**Location:** Recovery usage and invoice history panels before the first paid recovery or subscription invoice.  
**Purpose:** Keep an empty ledger calm and trustworthy, not like an error.  
**Format and dimensions:** Transparent WebP, 800×600, 4:3.  
**Generation prompt:**  
> [Reusable prompt prefix] A clean ledger plane with three faint horizontal rows and no entries, one violet rule at the left edge and a small mint marker waiting at the far right. Product-finance calm, light background, no currency, no numerals, no receipt text, no implying that a payment is pending.

### 4.8 Empty evidence state

**Asset:** `apps/web/public/assets/states/empty-evidence.webp`  
**Location:** Opportunity detail when an upstream integration has no supporting evidence payload.  
**Purpose:** Distinguish “evidence unavailable” from “verified”; avoid falsely reassuring the operator.  
**Format and dimensions:** Transparent WebP, 700×500, 7:5.  
**Generation prompt:**  
> [Reusable prompt prefix] A single translucent evidence frame with a clear empty center and a fine violet outline. Outside the frame, three faint data points stop short of connecting. Neutral, investigative and honest, not an error or success. Light mist, no text, no checkmark, no customer record.

### 4.9 Auth pages — revenue signal backdrop

**Asset:** `apps/web/public/assets/product/auth-signal-field.webp`  
**Location:** Left panel of sign-up and sign-in pages behind the existing brand and quote.  
**Purpose:** Give auth pages a more distinctive brand moment without competing with the form.  
**Format and dimensions:** AVIF, 1600×1800, portrait 8:9; text-safe left panel.  
**Generation prompt:**  
> [Reusable prompt prefix] Reinterpret the scene for a dark ink `#17212F` panel. A small sequence of violet ledger traces drifts upward from the lower edge and resolves into one calm mint ring near the far lower-right corner. Leave the upper-left and center-left nearly uniform for a real wordmark, headline and quote. Deep, secure, stable lighting, almost no bloom, no human silhouette, no text.

### 4.10 Compliance and security mark

**Asset:** `apps/web/public/assets/brand/consent-shield.svg`  
**Location:** Settings/compliance panel and security explanation near integration cards.  
**Purpose:** Identify consent and review controls with a crisp reusable vector.  
**Format and dimensions:** SVG source; render at 20, 32 and 64 px.  
**Prompt / design brief:** Create a simple outlined shield from two clean strokes and one small mint confirmation notch. Use violet for the structural outline. Keep the symbol neutral: it means “policy check,” not certification or legal guarantee. Never add a badge claiming compliance certification.

### 4.11 Secure demo checkout mark

**Asset:** `apps/web/public/assets/brand/demo-payment-mark.svg`  
**Location:** Demo payment page above “Payment link preview.”  
**Purpose:** Clarify the screen is a sandbox without implying a real payment has happened.  
**Format and dimensions:** SVG, 64×64 viewBox.  
**Prompt / design brief:** Use a compact payment-receipt outline with a violet border and an empty mint center point. Include no card-brand marks, lock certification, crypto symbol or “paid” check. The visible “Demo only” copy remains live HTML.

## 5. Shared loading, error and not-found states

### 5.1 Loading states

**Asset:** None.  
**Location:** Dashboard fetch, opportunity tables, integration status and billing panels.  
**Purpose:** Preserve responsiveness without adding decoration.  
**Format and dimensions:** CSS skeletons with reduced-motion support.  
**Prompt / implementation brief:** Do not generate loading images. Use short, low-contrast skeleton bars that match the final card geometry; honor `prefers-reduced-motion`; never shimmer continuously. Keep existing numeric values blank or labeled “Loading,” rather than inventing interim figures.

### 5.2 Service/connectivity error illustration

**Asset:** `apps/web/public/assets/states/service-connection-error.webp`  
**Location:** Optional full-panel state when the RECOVER API or a provider connection is unavailable.  
**Purpose:** Communicate a temporary connection break while preserving trust and a clear retry action.  
**Format and dimensions:** Transparent WebP, 900×650, 18:13.  
**Generation prompt:**  
> [Reusable prompt prefix] Two precise signal rails nearly meet across a small visible gap, with one muted violet node on each side and no mint success mark. Clean light background, understated temporary interruption, no broken glass, no warning triangle, no red alarm, no text, generous whitespace for a real retry message.

### 5.3 404 page illustration

**Asset:** `apps/web/public/assets/states/not-found-route.webp`  
**Location:** Dedicated 404 route after replacing the current wildcard fallback to the landing page.  
**Purpose:** Show that the route is missing and give the visitor a direct way back.  
**Format and dimensions:** Transparent WebP, 900×650, 18:13.  
**Generation prompt:**  
> [Reusable prompt prefix] A single violet path curves around an empty circular waypoint and reconnects to a small mint endpoint, suggesting a clear route home after a missed turn. Minimal light surface, balanced and reassuring, no map pin, no numbers, no text, ample open area for a real 404 heading and button.

## 6. Future sections — create only when the routes exist

### 6.1 About / mission hero

**Asset:** `apps/web/public/assets/future/mission-signal-field.webp`  
**Location:** Future About or mission page.  
**Purpose:** Explain the belief behind RECOVER: businesses lose follow-up context across disconnected tools, and disciplined recovery restores it.  
**Format and dimensions:** AVIF, 2400×1400, 12:7.  
**Generation prompt:**  
> [Reusable prompt prefix] A wide architectural field of separate ledger-like planes arranged with deliberate gaps. One fine violet signal runs across the planes and resolves into a complete mint loop at center-right. The structure feels like a real enterprise system, not a futuristic city. Leave the left third empty for a mission headline. No people, text, data labels, money or network globe.

### 6.2 Team photography

**Asset:** `apps/web/public/assets/future/team-portrait-*.webp`  
**Location:** Future About/Team page, only if real team profiles are part of the product story.  
**Purpose:** Establish human accountability behind a product that handles sensitive customer communication.  
**Format and dimensions:** Real portrait photographs, 1200×1500, consistent soft studio background and crop.  
**Prompt / production brief:** Do not generate fictional employees. Photograph the actual RECOVER team with permission, natural expressions, contemporary business-casual clothing, soft neutral studio light and consistent framing. If real photography is unavailable, use names and initials without portraits.

### 6.3 Testimonials and customer proof

**Asset:** `apps/web/public/assets/future/testimonial-field.webp`; customer logos sourced separately.  
**Location:** Future testimonial/social-proof section.  
**Purpose:** Give real customer statements a quiet, credible surface.  
**Format and dimensions:** Background AVIF, 2000×1100, plus licensed/source SVG logos.  
**Generation prompt:**  
> [Reusable prompt prefix] A barely visible field of fine ink-on-mist signal lines with two violet routes meeting at a small mint verification point near the far edge. Extremely low contrast, calm editorial background for a real quotation and a real customer logo. No quotation marks, no person, no logo, no typography and no implied endorsement.

**Trust rule:** Publish only approved, attributable customer quotes and authorized logos. Do not use generated customers or fabricated outcome claims. Keep demo figures explicitly labeled as demo until they represent validated production data.

### 6.4 Resources / blog header and article covers

**Asset:** `apps/web/public/assets/future/resources-index-field.webp` and topic covers under `future/resources/`.  
**Location:** Future resources index and blog posts.  
**Purpose:** Make educational material feel like a coherent research library rather than generic stock imagery.  
**Format and dimensions:** Index hero 2200×900; article cover 1600×900, 16:9; provide square 900×900 crops.  
**Reusable generation prompt:**  
> [Reusable prompt prefix] Create a textless editorial cover about {{TOPIC}} for an enterprise finance operations publication. Represent the topic with one precise physical object or geometry made from ledger planes and optical glass; use a restrained violet signal and one mint endpoint. Keep the left 40% calm for a typeset title, maintain strong readability at thumbnail size, and use the same camera, materials and light as the other RECOVER resource covers. No generic office photos, text, numerals, money or vendor marks.

**Topic substitutions:** `abandoned quote follow-up`, `accounts receivable timing`, `subscription renewal gaps`, `consent-aware communication`, `ecommerce checkout recovery`, `revenue attribution`. Generate one scene per topic with matched seeds and lighting.

### 6.5 LinkedIn cover / campaign banner

**Asset:** `apps/web/public/assets/social/linkedin-cover.webp`  
**Location:** RECOVER LinkedIn/company social profile and campaign materials.  
**Purpose:** Extend the same revenue-signal motif outside the website.  
**Format and dimensions:** WebP, 1128×191; keep the right side artwork clear of avatar overlap and reserve a clean area for typeset copy.  
**Generation prompt:**  
> [Reusable prompt prefix] Extreme-wide ink-to-mist editorial strip, a fine violet signal rail entering from the far left and passing through a small transparent calibration ring that resolves to mint near the right edge. Keep the left-center spacious for a real typeset brand statement and keep all detail away from the avatar-safe zone. Quiet, premium, no text, logos or numbers.

## 7. What stays native UI instead of becoming an image

- **Charts and source mix:** Recharts/SVG with live data. No generated graphs, chart labels or screenshot-derived charts.
- **Hero and dashboard numbers:** Live text and data. Artwork cannot contain the demo figures.
- **Pricing:** HTML copy and live plan amounts. Use the section background only as atmosphere.
- **Workflow sequences and opportunity timelines:** Native UI so state and approval status stay accurate.
- **Provider marks:** Real vendor SVGs under their current brand rules; never AI-generated.
- **Loading:** CSS skeletons, not spinner artwork.
- **Legal and compliance pages:** Typographic layout with a small vector divider at most. Avoid decorative imagery that can make legal terms look like promotional claims.
- **Customer/team evidence:** Real approved photos, logos and quotes only; otherwise use initials and clear demo labeling.

## 8. Execution order

1. **Brand foundation:** wordmark/mark vectors, favicon and official integration SVGs.
2. **High-impact marketing:** hero signal sculpture, authentic dashboard capture, three how-it-works vignettes, proof-band texture, pricing background and Open Graph card.
3. **Product polish:** overview recovery-loop sculpture, then empty states for opportunities, workflows, messages, integrations and billing.
4. **Operational states:** connection-error and 404 illustration; keep loading CSS-only.
5. **Expansion:** mission, genuine team photography, approved testimonials and resource covers when those page routes and real content exist.

The goal is a recognizable visual signature used sparingly: one precise signal motif, one verified mint endpoint, honest product UI, real integrations and ample space. That restraint is what makes RECOVER feel futuristic and safe at the same time.
