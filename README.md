# YouTube Description Cleaner Extension
A browser extension that removes sponsorships and unrelated links from YouTube video descriptions with multiple AI backend support.

### Screenshots

#### Extension in Action
![Screenshot of the extension in action](screenshot1280_800.png)

#### Before and After Comparison
![Before and after comparison of a cleaned YouTube description](before_after.png)

## Features

- Removes sponsor segments and promotional links
- Multiple processing modes:
  - Simple (first paragraph only)
  - Google Gemini (AI)
  - Mistral AI (AI)
  - Ollama (local AI models)
- Auto-clean on page load
- One-click original description restore
- Debug mode for developers

## Installation

### From Chrome Web Store

The extension is now available on the Chrome Web Store! [Install it here](https://chromewebstore.google.com/detail/youtube-description-rewri/bkifbmkpjodnagcldhlonpegnfolnlin).

### From sources

1. Download the extension files.
2. In a Chromium-based browser:
  - Go to `chrome://extensions/`.
  - Enable "Developer mode".
  - Click "Load unpacked".
  - Select the extension folder.

## Configuration

Configure these options in the popup:

- **Processing Mode**: Select text processing method
- **API Key**: Required for cloud AI services
  - [Get your Gemini API key here](https://aistudio.google.com/app/apikey)
- **Mistral AI**: Configure Mistral backend
  - [Get started with Mistral AI here](https://docs.mistral.ai/getting-started/quickstart/)
- **Ollama Settings**: URL and model for local Ollama
  - [Learn how to install Ollama](https://ollama.ai)
- **Debug Mode**: Enable for troubleshooting
- **Auto Clean**: Process descriptions automatically

## Supported Backends

| Mode       | Requires API Key | Description                          |
|------------|------------------|--------------------------------------|
| Simple     | No               | Keeps first paragraph only           |
| Gemini     | Yes              | Google's AI (free tier available)    |
| Mistral AI | Yes              | French AI (free tier available)      |
| Ollama     | No               | Run local AI models                  |

## How It Works

1. Detects YouTube video pages
2. Processes visible description text
3. Auto-clicks the "Show more" button to expand the description
4. Processes the full expanded description
5. Adds "Restore original" option

## Troubleshooting

- Enable debug mode to see console logs
- For AI modes, ensure valid API keys
- Refresh page after changing settings

## Version History

**0.0.1** - Initial release
- Basic description cleaning
- Multiple backend support
- Auto-clean functionality