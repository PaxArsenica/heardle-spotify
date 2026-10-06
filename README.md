# . Heardle Spotify

A lightweight Heardle-style music guessing game that connects to the Spotify Web API, loads a user's saved tracks, and lets them play preview snippets to guess the song.

## Features

- Spotify OAuth with PKCE
- Uses your Spotify library and track preview URLs
- Heardle-style gameplay loop with play, guess, and skip
- Responsive dark UI inspired by Spotify and Heardle
- No backend required for the front-end flow

## Local setup

1. Create a Spotify app at https://developer.spotify.com/dashboard/
2. Add a redirect URI matching your local dev URL, for example:
   - `http://localhost:5173`
3. Copy `.env.example` to `.env` and fill in the values:
   - `VITE_SPOTIFY_CLIENT_ID=your_client_id`
   - `VITE_SPOTIFY_REDIRECT_URI=http://localhost:5173`
4. Install dependencies:
   ```bash
   npm install
   ```
5. Start the app:
   ```bash
   npm run dev
   ```
6. Open the app in the browser and click "Connect Spotify".

## Spotify permissions

This app requests the following scopes:

- `user-library-read`
- `user-read-private`
- `user-read-email`

## Notes

- Spotify only provides preview URLs for some tracks, so the game works best with a library that includes songs with previews.
- For production deployments, use HTTPS and add the deployed redirect URI to your Spotify app.
- This is a front-end clone for prototyping and learning, not a production music service.
