# Truth Lens — Blue & White Edition

A responsive Truth Lens website inspired by the supplied Lovable reference and navigation screenshot.

## What's included

- Clean blue-and-white visual design with a sticky navigation bar and blue active-link underline
- Home, Verify Information, How It Works, and About navigation
- Blue VERIFY NOW call-to-action
- Responsive mobile menu and active-section navigation state
- Animated lens illustration, orbit details, hover states, and scroll-reveal sections
- Verification input tabs for a message/claim, website link, image, and video/document
- Drag-and-drop file selection for images and documents
- Local demo mode that works without any API keys
- Optional OpenAI web search and evidence analysis when an API key is configured

## Run without API keys

1. Open this folder in VS Code.
2. Open a terminal in this folder.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://localhost:3000`.

No `.env` file or API key is required for demo mode.

## Optional: enable live web search and AI analysis

1. Copy `.env.example` to `.env`.
2. Add your OpenAI API key as `OPENAI_API_KEY`.
3. Keep or change `OPENAI_MODEL` if needed.
4. Restart with `npm start`.

Live search and AI analysis require an API account with access and may incur API charges. Without the key, Truth Lens stays in local demo mode: it provides a manual review checklist, does not search the web, and does not produce a factual true/false verdict. Image and video/document uploads are currently file-selection demonstrations and are not analysed automatically.

Do not commit `.env` or API keys to GitHub.
