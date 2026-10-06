import { useEffect, useMemo, useRef, useState } from 'react';

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SCOPES = ['user-library-read', 'user-read-private', 'user-read-email'];
const STORAGE_KEYS = {
  token: 'spotify_access_token',
  verifier: 'spotify_code_verifier',
  state: 'spotify_auth_state',
};

function normalizeText(value) {
  return (value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

function base64UrlEncode(value) {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
  return base64UrlEncode(digest);
}

function generateCodeVerifier() {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = crypto.getRandomValues(new Uint8Array(64));
  return Array.from(randomValues)
    .map((value) => possible[value % possible.length])
    .join('');
}

function getRedirectUri() {
  return import.meta.env.VITE_SPOTIFY_REDIRECT_URI || window.location.origin;
}

async function startSpotifyAuth() {
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  if (!clientId) {
    throw new Error('Missing VITE_SPOTIFY_CLIENT_ID in your environment variables');
  }

  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = crypto.randomUUID();

  localStorage.setItem(STORAGE_KEYS.verifier, verifier);
  localStorage.setItem(STORAGE_KEYS.state, state);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: getRedirectUri(),
    scope: SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  });

  window.location.href = `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const verifier = localStorage.getItem(STORAGE_KEYS.verifier);
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;

  if (!clientId || !verifier) {
    throw new Error('Spotify auth is not configured correctly.');
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(),
      client_id: clientId,
      code_verifier: verifier,
    }).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spotify token exchange failed: ${errorText}`);
  }

  const data = await response.json();
  localStorage.setItem(STORAGE_KEYS.token, data.access_token);
  return data.access_token;
}

async function fetchSpotifyLibrary(accessToken) {
  const response = await fetch('https://api.spotify.com/v1/me/tracks?limit=50', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Unable to load your Spotify library now.');
  }

  const data = await response.json();

  return (data.items || [])
    .map((item) => item.track)
    .filter((track) => track && track.preview_url && typeof track.preview_url === 'string');
}

function App() {
  const audioRef = useRef(new Audio());
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_KEYS.token) || '');
  const [tracks, setTracks] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [guess, setGuess] = useState('');
  const [message, setMessage] = useState('Connect Spotify to start guessing songs from your library.');
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [round, setRound] = useState(1);
  const [isReady, setIsReady] = useState(false);

  const spotifyConfigured = useMemo(() => Boolean(import.meta.env.VITE_SPOTIFY_CLIENT_ID), []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const savedState = localStorage.getItem(STORAGE_KEYS.state);

    if (code && state && savedState && state === savedState) {
      const finishAuth = async () => {
        try {
          const accessToken = await exchangeCodeForToken(code);
          setToken(accessToken);
          setMessage('Spotify connected. Fetching your tracks...');
          localStorage.removeItem(STORAGE_KEYS.state);
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (error) {
          setMessage(error.message || 'Spotify authorization failed.');
        }
      };

      finishAuth();
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setSelectedTrack(null);
      setIsReady(false);
      return;
    }

    const loadLibrary = async () => {
      setIsLoading(true);
      setMessage('Loading your saved tracks...');

      try {
        const library = await fetchSpotifyLibrary(token);
        setTracks(library);
        setIsReady(library.length > 0);

        if (library.length > 0) {
          chooseRandomTrack(library, 1);
          setMessage('Song preview activated. Type your guess below.');
        } else {
          setMessage('No previewable songs were found in your Spotify library. Try another account or add tracks with previews.');
        }
      } catch (error) {
        setMessage(error.message || 'Unable to fetch your Spotify library.');
      } finally {
        setIsLoading(false);
      }
    };

    loadLibrary();
  }, [token]);

  const chooseRandomTrack = (library, nextRound = round) => {
    if (!library.length) {
      setSelectedTrack(null);
      return;
    }

    const randomIndex = Math.floor(Math.random() * library.length);
    const nextTrack = library[randomIndex];
    setSelectedTrack(nextTrack);
    setGuess('');
    setMessage(`Round ${nextRound}: Listen to the preview and make your guess.`);
    setIsPlaying(false);

    audioRef.current.pause();
    audioRef.current.src = nextTrack.preview_url;
    audioRef.current.currentTime = 0;
    audioRef.current.onended = () => setIsPlaying(false);
  };

  const togglePreview = () => {
    if (!selectedTrack?.preview_url) {
      setMessage('No preview available for the current track.');
      return;
    }

    audioRef.current.src = selectedTrack.preview_url;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    audioRef.current.play();
    setIsPlaying(true);
  };

  const handleGuessSubmit = (event) => {
    event.preventDefault();
    if (!selectedTrack) {
      return;
    }

    const guessValue = normalizeText(guess);
    const title = normalizeText(selectedTrack.name);
    const artist = normalizeText(selectedTrack.artists.map((artistItem) => artistItem.name).join(' '));

    if (!guessValue) {
      setMessage('Type a track or artist name before submitting your guess.');
      return;
    }

    const isCorrect =
      guessValue === title ||
      guessValue === artist ||
      title.includes(guessValue) ||
      artist.includes(guessValue) ||
      guessValue.includes(title) ||
      guessValue.includes(artist);

    if (isCorrect) {
      setMessage(`Correct! It was “${selectedTrack.name}” by ${selectedTrack.artists.map((item) => item.name).join(', ')}.`);
      return;
    }

    setMessage('Not quite. Give the preview another listen or skip to the next round.');
  };

  const handleNextTrack = () => {
    const nextRound = round + 1;
    setRound(nextRound);
    chooseRandomTrack(tracks, nextRound);
  };

  const handleDisconnect = () => {
    localStorage.removeItem(STORAGE_KEYS.token);
    setToken('');
    setTracks([]);
    setSelectedTrack(null);
    setGuess('');
    setMessage('Spotify disconnected. Connect again to play.');
    audioRef.current.pause();
    setIsPlaying(false);
  };

  return (
    <div className="app-shell">
      <div className="card">
        <div className="header-row">
          <div>
            <p className="eyebrow">Spotify music challenge</p>
            <h1>Heardle</h1>
          </div>
          {token && (
            <button className="secondary" onClick={handleDisconnect} type="button">
              Disconnect
            </button>
          )}
        </div>

        {!spotifyConfigured && (
          <div className="notice warning">
            Add your Spotify client ID to a <code>.env</code> file before running the app.
          </div>
        )}

        {!token ? (
          <div className="auth-panel">
            <p>
              Link your Spotify account and play a lightweight Heardle clone built with your library and
              preview clips.
            </p>
            <button
              onClick={async () => {
                try {
                  await startSpotifyAuth();
                } catch (error) {
                  setMessage(error.message || 'Spotify authentication could not start.');
                }
              }}
              type="button"
              className="primary"
              disabled={!spotifyConfigured || isLoading}
            >
              Connect Spotify
            </button>
            <p className="small-text">This app asks for Spotify library access and listens to track previews.</p>
          </div>
        ) : (
          <>
            <div className="status-panel">
              <span>Round {round}</span>
              <span className="pill">{isReady ? 'Ready' : 'Loading...'}</span>
            </div>

            <div className="preview-panel">
              <button className="primary" onClick={togglePreview} type="button" disabled={!selectedTrack || isLoading}>
                {isPlaying ? 'Pause preview' : 'Play preview'}
              </button>
              {selectedTrack && (
                <div className="track-meta">
                  <strong>{selectedTrack.name}</strong>
                  <span>
                    {selectedTrack.artists.map((artistItem) => artistItem.name).join(', ')}
                  </span>
                </div>
              )}
            </div>

            <form onSubmit={handleGuessSubmit} className="guess-form">
              <label htmlFor="guess">Your guess</label>
              <div className="guess-row">
                <input
                  id="guess"
                  type="text"
                  value={guess}
                  onChange={(event) => setGuess(event.target.value)}
                  placeholder="Type a song or artist name"
                  disabled={!selectedTrack || isLoading}
                />
                <button className="primary" type="submit" disabled={!selectedTrack || isLoading}>
                  Guess
                </button>
              </div>
            </form>

            <div className="actions-row">
              <button className="secondary" type="button" onClick={handleNextTrack} disabled={!selectedTrack || isLoading}>
                Skip track
              </button>
            </div>
          </>
        )}

        <div className="message-box" aria-live="polite">
          {message}
        </div>
      </div>
    </div>
  );
}

export default App;
