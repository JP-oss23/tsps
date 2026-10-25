const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Server } = require('../dist/Server');
Server.installProductionPathResolver();
const { CachePipeline } = require('../dist/game/cache/CachePipeline');
const { PluginManager } = require('../dist/plugins/PluginManager');
const { PlayerSession } = require('../dist/net/PlayerSession');
const { PacketSender } = require('../dist/net/packet/PacketSender');
const { Location } = require('../dist/game/model/Location');
const Progress = require('../plugins/world/Progress.Music');
const MusicPlugin = require('../plugins/world/Music.plugin');

const handlers = new Map();
const loginHandlers = [];
let questAnswer;
let diaryAnswer;
let catalog;
let trackNames;
let setupPromise;
const api = new Proxy({
  core: PluginManager.getCoreApi(),
  persistAttribute() {},
  getBonusManager() { return { update() {} }; },
  onPlayerLogin(handler) { loginHandlers.push(handler); },
  onCustomEvent(name, handler) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
  emitCustomEvent(name, request) {
    if (name === 'quest-cape:can-use') {
      if (questAnswer !== undefined) request.canUse = questAnswer;
      return;
    }
    if (name === 'diary:all-complete') {
      if (diaryAnswer !== undefined) request.complete = diaryAnswer;
      return;
    }
    for (const handler of handlers.get(name) ?? []) handler(request);
  },
}, { get: (target, key) => key in target ? target[key] : () => {} });

function setup() {
  if (!setupPromise) setupPromise = (async () => {
    await CachePipeline.initialize(process.cwd());
    MusicPlugin.register(api);
    catalog = MusicPlugin._test.getCatalog();
    trackNames = api.core.Music.trackNames();
  })();
  return setupPromise;
}

function makePlayer({ tracks = [], coins = 0, freeSlots = 28, chatboxTransparent = false } = {}) {
  const attrs = new Map([[Progress.UNLOCKED_TRACKS_ATTRIBUTE, tracks]]);
  const configs = [];
  const scripts = [];
  const flags = [];
  const varbits = [];
  const messages = [];
  const items = [];
  let coinAmount = coins;
  const inventory = {
    getAmount(id) { return id === 995 ? coinAmount : 0; },
    getFreeSlots() { return freeSlots; },
    deleteNumber(id, amount) { if (id === 995) coinAmount -= amount; },
    adds(id, amount) { items.push([id, amount]); return inventory; },
    contains() { return false; },
    refreshItems() {},
  };
  const sender = {
    sendConfig(id, value) { configs.push([id, value]); return sender; },
    sendVarbit(id, value) { varbits.push([id, value]); return sender; },
    getVarbit(id) { return id === 4608 && chatboxTransparent ? 1 : 0; },
    sendInterfaceFlagsRange(...args) { flags.push(args); return sender; },
    sendClientScript(id, ...args) { scripts.push([id, ...args]); return sender; },
  };
  const equipment = { contains() { return false; }, refreshItems() {}, getItems() { return []; }, forSlot() { return { getId: () => -1 }; } };
  return {
    attrs, configs, scripts, flags, varbits, messages, items, inventory,
    getAttribute: (key) => attrs.get(key),
    setAttribute: (key, value) => attrs.set(key, value),
    getPacketSender: () => sender,
    getInventory: () => inventory,
    getEquipment: () => equipment,
    getBanks: () => [],
    sendMessage: (message) => messages.push(message),
  };
}

test('music unlocks pack complete cache bitfields and restore from persisted tracks on login', async () => {
  await setup();
  const player = makePlayer();
  const first = Object.keys(catalog.slotByTrackId).map(Number).find((id) => catalog.slotByTrackId[id].varp === 20);
  const second = Object.keys(catalog.slotByTrackId).map(Number).find((id) => id !== first && catalog.slotByTrackId[id].varp === 20);
  const firstBit = catalog.slotByTrackId[first].bit;
  const secondBit = catalog.slotByTrackId[second].bit;
  handlers.get('audio:play-song')[0]({ player, trackId: first });
  handlers.get('audio:play-song')[0]({ player, trackId: second });
  handlers.get('audio:play-song')[0]({ player, trackId: second });
  handlers.get('audio:play-song')[0]({ player, trackId: 99999 });
  assert.equal(typeof trackNames[first], 'string');
  assert.deepEqual(player.attrs.get(Progress.UNLOCKED_TRACKS_ATTRIBUTE), [first, second].sort((a, b) => a - b));
  assert.deepEqual(player.configs.filter(([id]) => id === 20), [[20, 1 << firstBit], [20, (1 << firstBit) | (1 << secondBit)]]);
  assert.equal(player.messages.length, 2);

  player.configs.length = 0;
  loginHandlers[0]({ player });
  assert.deepEqual(player.configs.find(([id]) => id === 20), [20, (1 << firstBit) | (1 << secondBit)]);
});

test('an unlock names the track in the chatbox-transparency colour, unclosed and without a full stop', async () => {
  await setup();
  // rsprox 224/01437 (transparent chatbox) and 234/03275 (opaque until transparency is turned on).
  const EVERYWHERE = 268;
  assert.equal(trackNames[EVERYWHERE], 'Everywhere');
  const transparent = makePlayer({ chatboxTransparent: true });
  handlers.get('music:unlock-track')[0]({ player: transparent, trackId: EVERYWHERE });
  assert.deepEqual(transparent.messages, ['You have unlocked a new music track: <col=ff3045>Everywhere']);
  const opaque = makePlayer();
  handlers.get('music:unlock-track')[0]({ player: opaque, trackId: EVERYWHERE });
  assert.deepEqual(opaque.messages, ['You have unlocked a new music track: <col=e00a19>Everywhere']);
  // Live sends only the unlock varp and the message, no jingle (this sender has no jingle method).
  assert.equal(opaque.configs.length, 1);
  assert.deepEqual(opaque.scripts, []);
});

test('music cape trim fails closed when quest or diary eligibility is unanswered', async () => {
  await setup();
  const player = makePlayer({ tracks: catalog.allTrackIds });
  questAnswer = undefined;
  diaryAnswer = true;
  assert.equal(MusicPlugin._test.canTrim(player), false);
  questAnswer = true;
  diaryAnswer = undefined;
  assert.equal(MusicPlugin._test.canTrim(player), false);
  diaryAnswer = true;
  assert.equal(MusicPlugin._test.canTrim(player), true);
  questAnswer = undefined;
  diaryAnswer = undefined;
});

test('region-change unlock uses the cache row slot for archive song IDs', async () => {
  await setup();
  const player = makePlayer();
  assert.deepEqual(catalog.slotByTrackId[549], { varp: 1338, bit: 25, key: '1338:25' });
  handlers.get('music:unlock-track')[0]({ player, trackId: 549 });
  assert.deepEqual(player.configs, [[1338, 1 << 25]]);
  assert.deepEqual(player.attrs.get(Progress.UNLOCKED_TRACKS_ATTRIBUTE), [549]);
});

test('playing a song selects its native Music DB row in the now-playing varp', async () => {
  await setup();
  const player = makePlayer();
  const row = api.core.Music.tracks().find(({ id }) => id === 549);
  assert.equal(row.rowId, 2670);
  handlers.get('audio:play-song')[0]({ player, trackId: 549 });
  assert.deepEqual(player.configs, [[1338, 1 << 25], [3883, 2670]]);
  assert.deepEqual(player.scripts, [[3936]]);
});

test('PlayerSession unlocks the current region in manual mode without starting its song', async () => {
  await setup();
  const trackId = api.core.Music.forRegion(12850);
  assert.equal(typeof trackId, 'number', 'Lumbridge region has a cache-mapped song');
  const player = {
    getLocation: () => new Location(3222, 3218, 0),
    getArea: () => null,
    getAudioSettings: () => ({ 18: 1 }),
    getPacketSender: () => ({ sendSong() { assert.fail('manual mode must not start region music'); } }),
  };
  const session = new PlayerSession({ isOpen: true });
  session.setPlayer(player);
  // Region-item bookkeeping is independent from music and requires a fully initialized Player.
  session.lastGroundItemRegion = 12850;
  session.lastGroundItemLevel = 0;
  const emit = PluginManager.emitCustomEvent;
  let unlock;
  const stopAtUnlock = new Error('captured region unlock');
  PluginManager.emitCustomEvent = (name, payload) => {
    if (name === 'music:unlock-track') {
      unlock = payload;
      throw stopAtUnlock;
    }
  };
  try {
    assert.throws(() => session.flush(), stopAtUnlock);
  } finally {
    PluginManager.emitCustomEvent = emit;
  }
  assert.equal(unlock.player, player);
  assert.equal(unlock.trackId, trackId);
});

test('PacketSender unlocks only after the song packet is accepted', async () => {
  await setup();
  const events = [];
  const emit = PluginManager.emitCustomEvent;
  PluginManager.emitCustomEvent = (name, payload) => events.push([name, payload]);
  try {
    const player = { getSession: () => ({ sendClientPacket: () => true }) };
    new PacketSender(player).sendSong(549);
    assert.equal(events.length, 1);
    assert.equal(events[0][0], 'audio:play-song');
    assert.equal(events[0][1].player, player);
    assert.equal(events[0][1].trackId, 549);

    events.length = 0;
    const rejectedPlayer = { getSession: () => ({ sendClientPacket: () => false }) };
    new PacketSender(rejectedPlayer).sendSong(549);
    assert.deepEqual(events, []);
  } finally {
    PluginManager.emitCustomEvent = emit;
  }
});

test('music cape purchase allows the exact coin stack to free the second reward slot', async () => {
  await setup();
  questAnswer = undefined;
  diaryAnswer = undefined;
  const player = makePlayer({ tracks: catalog.nonHolidayTrackIds, coins: 99000, freeSlots: 1 });
  MusicPlugin._test.buyMusicCape(player);
  assert.deepEqual(player.items, [
    [api.core.ItemIdentifiers.MUSIC_CAPE, 1],
    [api.core.ItemIdentifiers.MUSIC_HOOD, 1],
  ]);
  assert.equal(player.attrs.get(Progress.CAPE_OWNED_ATTRIBUTE), true);
  assert.equal(player.attrs.get(Progress.AIR_GUITAR_UNLOCKED_ATTRIBUTE), true);
  assert.deepEqual(player.varbits, [[4673, 1]]);
  assert.equal(player.inventory.getAmount(995), 0);
});

test('music progress refuses an empty catalogue and uses all cache-defined native unlock slots', async () => {
  await setup();
  const player = makePlayer();
  assert.equal(Progress.allUnlocked(player, []), false);
  assert.equal(catalog.allTrackIds.length > 800, true);
  assert.equal(Object.keys(catalog.slotByTrackId).length > catalog.allTrackIds.length, true);
});

test('music tab restores native jukebox row and now-playing actions after root mounts', async () => {
  await setup();
  const player = makePlayer();
  MusicPlugin._test.enableMusicActions(player);
  assert.deepEqual(player.flags, [
    [(239 << 16) | 11, 0, api.core.CacheDefinitions.getDbTableRows(44).length - 1, 62],
    [(239 << 16) | 4, -1, -1, 60],
  ]);
  assert.deepEqual(player.scripts, [[3936]]);
});

test('invalid music cape is banked when full and destroyed for ultimate ironmen', async () => {
  await setup();
  const originalUnequip = api.core.EquipPacketListener.unequip;
  api.core.EquipPacketListener.unequip = () => false;
  const cape = { getId: () => api.core.ItemIdentifiers.MUSIC_CAPE };
  function playerForFallback(ironmanMode) {
    const slots = [];
    slots[api.core.Equipment.CAPE_SLOT] = cape;
    const equipment = {
      getItems: () => slots,
      forSlot: (slot) => slots[slot],
      set(slot, item) { slots[slot] = item; },
      refreshItems() {},
    };
    const bankItems = [];
    const bank = { getFreeSlots: () => 1, add(item) { bankItems.push(item); }, refreshItems() {} };
    const player = makePlayer();
    player.getEquipment = () => equipment;
    player.getBanks = () => [bank];
    player.getAttribute = (key) => key === 'ironman:mode' ? ironmanMode : player.attrs.get(key);
    player.getUpdateFlag = () => ({ flag() {} });
    player.bankItems = bankItems;
    player.slots = slots;
    return player;
  }
  try {
    const regular = playerForFallback(undefined);
    MusicPlugin._test.removeInvalidEquippedCape(regular);
    assert.deepEqual(regular.bankItems, [cape]);
    assert.equal(regular.slots[api.core.Equipment.CAPE_SLOT].getId(), -1);

    const ultimate = playerForFallback('ultimate');
    MusicPlugin._test.removeInvalidEquippedCape(ultimate);
    assert.equal(ultimate.slots[api.core.Equipment.CAPE_SLOT].getId(), -1);
    assert.match(ultimate.messages[0], /destroyed/);
  } finally {
    api.core.EquipPacketListener.unequip = originalUnequip;
  }
});

// Live's packets around music (rsprox revs 236-239, 1,584 jingles): a region change carries the
// MidiSongV2 defaults 0/60/60/0 (fade-out delay/speed, fade-in delay/speed, in client cycles),
// and every jingle is preceded on the same tick by the current track with all four fades 0; the
// client resumes that track itself when the jingle ends.
test('encodePlaySong carries the live fade defaults, or the fades it is given', () => {
  const { encodePlaySong } = require('../dist/net/protocol/ClientProtocol');
  const body = (packet) => packet.subarray(packet.length - 10);
  assert.deepEqual([...body(encodePlaySong(454))], [1, 198, 0, 0, 0, 60, 0, 60, 0, 0]);
  assert.deepEqual([...body(encodePlaySong(454, { fadeOutDelay: 0, fadeOutSpeed: 0, fadeInDelay: 0, fadeInSpeed: 0 }))], [1, 198, 0, 0, 0, 0, 0, 0, 0, 0]);
});

test('sendJingle first re-sends the current track with zero fades, then the jingle, and returns the sender', async () => {
  await setup();
  const frames = [];
  const player = { getSession: () => ({ sendClientPacket: (frame) => { frames.push(frame); return true; }, getCurrentMusicTrack: () => 454 }) };
  const sender = new PacketSender(player);
  const emit = PluginManager.emitCustomEvent;
  PluginManager.emitCustomEvent = () => {};
  try {
    assert.equal(sender.sendJingle(18), sender);
  } finally {
    PluginManager.emitCustomEvent = emit;
  }
  assert.deepEqual(frames.map((f) => f[0]), [133, 132], 'PLAY_SONG then PLAY_JINGLE');
  assert.deepEqual([...frames[0].subarray(frames[0].length - 10)], [1, 198, 0, 0, 0, 0, 0, 0, 0, 0], 'the current track, zero fades');
  assert.deepEqual([...frames[1].subarray(frames[1].length - 5)], [0, 18, 0, 0, 0]);

  frames.length = 0;
  const silent = { getSession: () => ({ sendClientPacket: (frame) => { frames.push(frame); return true; }, getCurrentMusicTrack: () => -1 }) };
  const quiet = new PacketSender(silent);
  assert.equal(quiet.sendJingle(18), quiet);
  assert.deepEqual(frames.map((f) => f[0]), [132], 'no known track: only the jingle');
});

test('PlayerSession remembers the track it started for the region, for the pre-jingle re-send', async () => {
  await setup();
  const trackId = api.core.Music.forRegion(12850);
  const songs = [];
  const player = {
    getLocation: () => new Location(3222, 3218, 0),
    getArea: () => null,
    getAudioSettings: () => ({ 18: 0 }),
    getPacketSender: () => ({ sendSong: (id) => { songs.push(id); } }),
  };
  const session = new PlayerSession({ isOpen: true });
  session.setPlayer(player);
  session.lastGroundItemRegion = 12850;
  session.lastGroundItemLevel = 0;
  assert.equal(session.getCurrentMusicTrack(), -1, 'nothing before the first flush');
  const emit = PluginManager.emitCustomEvent;
  PluginManager.emitCustomEvent = () => {};
  try {
    try { session.flush(); } catch { /* the fake player stops the rest of flush; music ran first */ }
  } finally {
    PluginManager.emitCustomEvent = emit;
  }
  assert.deepEqual(songs, [trackId]);
  assert.equal(session.getCurrentMusicTrack(), trackId);
});

// Live (rsprox revs 236-239, 17 sessions with a mid-session music volume change): when the music
// volume varp rises from 0 the server sends track 147 (silence) with zero fades on that tick and the
// area track with zero fades on the next; dropping to 0 sends nothing.
test('raising the music volume from 0 re-sends silence, then the area track, with zero fades', async () => {
  await setup();
  const changed = handlers.get('audio:setting-changed');
  assert.ok(changed && changed.length, 'the Music plugin listens for audio setting changes');
  const songs = [];
  const player = {
    getAudioSettings: () => ({ 18: 0, 168: 5 }),
    getSession: () => ({ getCurrentMusicTrack: () => 454 }),
    getPacketSender: () => ({ sendSong: (id, fades) => { songs.push([id, fades]); } }),
    isRegistered: () => true,
  };
  const tasks = [];
  const submit = api.core.TaskManager.submit;
  api.core.TaskManager.submit = (task) => { tasks.push(task); };
  try {
    for (const handler of changed) handler({ player, varpId: 168, previous: 0, value: 5 });
    assert.deepEqual(songs, [[147, { fadeOutDelay: 0, fadeOutSpeed: 0, fadeInDelay: 0, fadeInSpeed: 0 }]], 'silence now');
    assert.equal(tasks.length, 1, 'the track follows on the next tick');
    tasks[0].execute();
    assert.deepEqual(songs[1], [454, { fadeOutDelay: 0, fadeOutSpeed: 0, fadeInDelay: 0, fadeInSpeed: 0 }]);

    songs.length = 0; tasks.length = 0;
    for (const handler of changed) handler({ player, varpId: 168, previous: 5, value: 0 });
    for (const handler of changed) handler({ player, varpId: 168, previous: 5, value: 60 });
    for (const handler of changed) handler({ player, varpId: 169, previous: 0, value: 60 });
    assert.deepEqual(songs, [], 'only a rise of the music volume from 0 restarts anything');
    assert.deepEqual(tasks, []);

    const manual = { ...player, getAudioSettings: () => ({ 18: 1, 168: 5 }) };
    for (const handler of changed) handler({ player: manual, varpId: 168, previous: 0, value: 5 });
    assert.deepEqual(songs, [], 'manual music mode: nothing to restart');
    const silent = { ...player, getSession: () => ({ getCurrentMusicTrack: () => -1 }) };
    for (const handler of changed) handler({ player: silent, varpId: 168, previous: 0, value: 5 });
    assert.deepEqual(songs, [], 'no region track known: nothing to restart');
  } finally {
    api.core.TaskManager.submit = submit;
  }
});

test('a music volume varp from the client announces audio:setting-changed with the old and new value', () => {
  const { Player } = require('../dist/game/entity/impl/player/Player');
  const events = [];
  const emit = PluginManager.emitCustomEvent;
  PluginManager.emitCustomEvent = (name, payload) => { if (name === 'audio:setting-changed') events.push(payload); };
  try {
    const player = new Player(null);
    assert.equal(player.getAudioSettings()[168], 100);
    assert.equal(player.applyAudioSettingFromClient(168, 0), true);
    assert.equal(player.applyAudioSettingFromClient(168, 0), true, 'the same value again');
    assert.equal(player.applyAudioSettingFromClient(168, 5), true);
    assert.equal(player.applyAudioSettingFromClient(4242, 5), false, 'not an audio varp');
    assert.deepEqual(events.map((e) => [e.varpId, e.previous, e.value]), [[168, 100, 0], [168, 0, 5]], 'only changes are announced');
    assert.equal(events[0].player, player);
  } finally {
    PluginManager.emitCustomEvent = emit;
  }
});

// Review on #1077: the next-tick restart must not send a track that is no longer current. Raise the
// volume from 0 with track 454 current, change the region track to 999 before the queued tick runs:
// the session already sent 999, so the restart must not put 454 back. The same goes for a music
// volume dropped to 0 again, manual mode, and a second rise that queued its own restart.
test('the next-tick restart is dropped when the track, mode or volume changed in between', async () => {
  await setup();
  const [changed] = handlers.get('audio:setting-changed');
  let current = 454;
  let settings = { 18: 0, 168: 5 };
  const songs = [];
  const player = {
    getAudioSettings: () => settings,
    getSession: () => ({ getCurrentMusicTrack: () => current }),
    getPacketSender: () => ({ sendSong: (id) => { songs.push(id); } }),
    isRegistered: () => true,
  };
  const tasks = [];
  const submit = api.core.TaskManager.submit;
  api.core.TaskManager.submit = (task) => { tasks.push(task); };
  const rise = () => changed({ player, varpId: 168, previous: 0, value: settings[168] });
  try {
    rise();
    current = 999; // region change before the next tick; the session sent 999 itself
    tasks.shift().execute();
    assert.deepEqual(songs, [147], 'the old track is not replayed over the new one');

    songs.length = 0; current = 454;
    rise();
    settings = { 18: 0, 168: 0 };
    tasks.shift().execute();
    assert.deepEqual(songs, [147], 'volume back at 0: nothing more');

    songs.length = 0; settings = { 18: 0, 168: 5 };
    rise();
    settings = { 18: 1, 168: 5 };
    tasks.shift().execute();
    assert.deepEqual(songs, [147], 'manual music mode: nothing more');

    songs.length = 0; settings = { 18: 0, 168: 5 };
    rise();
    rise();
    tasks.shift().execute();
    tasks.shift().execute();
    assert.deepEqual(songs, [147, 147, 454], 'two rises in one tick restart the track once');
  } finally {
    api.core.TaskManager.submit = submit;
  }
});
