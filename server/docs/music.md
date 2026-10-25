# Music progress

Track titles, song archive IDs, unlock-varp banks/bits, and automatically unlocked tracks come from cache DB table 44. Track rows without an unlock slot (or a parent row with a slot) are variants and do not count toward the cape requirement. Rows that share a slot are counted once.

On a successful song packet or an authoritative region change, the Music plugin persists the track's canonical unlock slot and updates its complete native varp bitfield. A successful song packet also sets native current-track varp 3883 to the track's DB-table row ID, then runs cache script 3936 to refresh the Music tab's `Playing:` field. The same script runs when Music actions are bootstrapped after login or the welcome-screen Play button. Login restores unlock bitfields and tracks marked automatically unlocked by the cache. The Music sidebar uses native widget group 239, whose player-side jukebox reads those same unlock varps and only permits playback for unlocked entries.

Olaf the Bard sells the Music cape and hood for 99,000 coins after every non-holiday unlock slot is complete. The cape's Air Guitar emote flag is permanently granted on purchase. Using the cape requires the non-holiday tracks to remain complete; its teleport leads to Falo. Trimming additionally requires every cache-listed music unlock slot, every quest, and every Achievement Diary tier. Holiday status is determined by matching cache track titles against the current OSRS Wiki holiday-track list.

Track unlocks send a message once: "You have unlocked a new music track: <col=ff3045>Name" on a transparent chatbox, `<col=e00a19>` on an opaque one (varbit 4608), with no closing tag or full stop. No jingle is played: live sends only the unlock varp and the message. Across the 988 unlock messages in the rsprox recordings (revs 224-239, e.g. 224/01437), the few ticks that also carry a jingle owe it to something else, such as a League task notification; 234/03275 shows the colour switch when transparency is turned on. Missing quest, event and holiday unlock sources still need implementation; cape requirements include their native slots.

## Jingles and fades

As captured (rsprox revs 236-239, 1,584 jingles): a region change sends the track with the
MidiSongV2 defaults 0/60/60/0 (fade-out delay and speed, fade-in delay and speed, in 20 ms client
cycles), and every jingle is preceded on the same tick by the current track with all four fades 0.
No song packet follows most jingles: the client cuts the track, plays the jingle and resumes the
track itself when the jingle ends; a song packet that arrives meanwhile is the track to resume.
`PacketSender.sendSong(id, fades?)` sends the defaults, and `sendJingle(id)` sends the session's
current track (`PlayerSession.getCurrentMusicTrack()`) with zero fades before the jingle. The jingle
packet's 24-bit length field is left as the old callers pass it; the client no longer reads it.

When the music volume varp (168) rises from 0, live sends track 147 (silence) with zero fades on that
tick and the area track with zero fades on the next (17 captured sessions), so the track starts over;
`restartMusicAfterVolumeRaised` in `Music.plugin.js` does the same from the `audio:setting-changed`
event that `Player.applyAudioSettingFromClient` announces. Dropping the volume to 0 sends nothing; the
client keeps the track it was asked for while silent and starts it when volume comes back.
