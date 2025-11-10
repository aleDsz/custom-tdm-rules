/** GameMode config */
interface GameModeConfig {
  /** Amount of kills to reach to win */
  score: number;

  /** Time in seconds + freeze time */
  timeLimit: number;

  /** Seconds of freeze time at round start */
  freezeTime: number;

  /** How many kills to trigger mid progress VO */
  progressStageEarly: number;

  /** How many kills to trigger mid progress VO */
  progressStageMid: number;

  /** How many kills to trigger late progress VO */
  progressStageLate: number;

  /** Godot ID for the Team 1 */
  team1ID: number;

  /** Godot ID for the Team 2 */
  team2ID: number;

  /** Godot ID for the Team 1 HQ */
  hqRoundStartTeam1: number;

  /** Godot ID for the Team 2 HQ */
  hqRoundStartTeam2: number;

  /**
   * Starting ID for spawn point SpatialObjects.
   *
   * Your spawners need to be a SpatialObject (any object that is an actual prop) in incremental IDs starting from startSpawnPointID or they'll not be parsed
   */
  startSpawnPointID: number;

  /** Amount of additional damage for snipers */
  sniperAdditionalDamage: number;

  /** The close range sweetspot max distance between 0-Xm */
  sniperMaxDistanceToHitKill: number;
}

/** Player stats for the scoreboard */
interface PlayerStats {
  /** Amount of player kills */
  k: number;

  /** Amount of player deaths */
  d: number;

  /** Amount of player assists */
  a: number;

  /** Amount of player kills with headshot */
  hs: number;
}

const SNIPERS: mod.Weapons[] = [
  mod.Weapons.Sniper_M2010_ESR,
  mod.Weapons.Sniper_PSR,
  mod.Weapons.Sniper_SV_98,
  (mod as any)?.Weapons.Sniper_Mini_Scout
];

const RESTRICTED_GADGETS: mod.Gadgets[] = [
  mod.Gadgets.Misc_Assault_Ladder,
  mod.Gadgets.Misc_Incendiary_Round_Shotgun,
  mod.Gadgets.Launcher_Thermobaric_Grenade,
  mod.Gadgets.Launcher_Long_Range,
  mod.Gadgets.Launcher_High_Explosive,
  mod.Gadgets.Deployable_Cover,
];

const GAMEMODE_CONFIG: GameModeConfig = {
  score: 200,
  freezeTime: 0,
  timeLimit: 40 * 60,
  progressStageEarly: 50,
  progressStageMid: 100,
  progressStageLate: 175,
  team1ID: 1,
  team2ID: 2,
  hqRoundStartTeam1: 1,
  hqRoundStartTeam2: 2,
  startSpawnPointID: 9001,
  sniperAdditionalDamage: 100,
  sniperMaxDistanceToHitKill: 40
};

const UIWIDGET_TIMER_BEGINNING_ID: string = "UIWidgetTimerBeginning";
const UIWIDGET_TIMER_BEGINNING_TEXT_ID: string = "UIWidgetTimerBeginningText";
const UIWIDGET_SCORE_CONTAINER_ID: string = "UIWidgetContainer";
const UIWIDGET_SCORE_TIMER_ID: string = "UIWidgetTimer";
const UIWIDGET_SCORE_SEPARATOR_ID: string = "UIWidgetSeparator";
const UIWIDGET_SCORE_TEAM1_SCORE_ID: string = "UiWidgetTeam1Score";
const UIWIDGET_SCORE_TEAM1_NAME_ID: string = "UiWidgetTeam1Name";
const UIWIDGET_SCORE_TEAM2_SCORE_ID: string = "UiWidgetTeam2Score";
const UIWIDGET_SCORE_TEAM2_NAME_ID: string = "UiWidgetTeam2Name";
const UIWIDGET_SCORE_FIRSTTO_ID: string = "UiWidgetFirstTo";

const spawners: mod.Vector[] = [];

const playersStats: { [id: number]: PlayerStats } = {};

let gameStarted: boolean = false;
let gameEnded: boolean = false;

let leaderTeam: mod.Team | null = null;

let tick: number = 0;

let hasPlayedTime120LeftVO: boolean = false;
let hasPlayedTime30LeftVO: boolean = false;
let hasPlayedTime60LeftVO: boolean = false;

const winProgressStages = {
  [GAMEMODE_CONFIG.progressStageEarly]: {
    winning: mod.VoiceOverEvents2D.ProgressEarlyWinning,
    losing: mod.VoiceOverEvents2D.ProgressEarlyLosing,
    hasPlayed: false,
  },
  [GAMEMODE_CONFIG.progressStageMid]: {
    winning: mod.VoiceOverEvents2D.ProgressLateWinning,
    losing: mod.VoiceOverEvents2D.ProgressLateLosing,
    hasPlayed: false,
  },
  [GAMEMODE_CONFIG.progressStageLate]: {
    winning: mod.VoiceOverEvents2D.PlayerCountEnemyLow,
    losing: mod.VoiceOverEvents2D.PlayerCountFriendlyLow,
    hasPlayed: false,
  },
};

function playSFX(sfxId: mod.RuntimeSpawn_Common) {
  const sfx = mod.SpawnObject(
    sfxId,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  mod.EnableVFX(sfx, true);
  mod.PlaySound(sfx, 100);
}

function playVO(vo: mod.VoiceOverEvents2D, team?: any) {
  const voModule: mod.VO = mod.SpawnObject(
    mod.RuntimeSpawn_Common.SFX_VOModule_OneShot2D,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(0, 0, 0)
  );

  if (team) {
    mod.PlayVO(voModule, vo, mod.VoiceOverFlags.Alpha, team);
  } else {
    mod.PlayVO(voModule, vo, mod.VoiceOverFlags.Alpha);
  }
}

function playProgressSFX(team1: mod.Team, team2: mod.Team) {
  const team1Score = mod.GetGameModeScore(team1);
  const team2Score = mod.GetGameModeScore(team2);
  if (team1Score === team2Score) return;

  const isTeam1Winning = team1Score > team2Score;
  const winningTeam = isTeam1Winning ? team1 : team2;
  const losingTeam = isTeam1Winning ? team2 : team1;
  const winningTeamScore = Math.max(team1Score, team2Score);

  const stage =
    winProgressStages[winningTeamScore as keyof typeof winProgressStages];

  if (stage && !stage.hasPlayed) {
    playVO(stage.winning, winningTeam);
    playVO(stage.losing, losingTeam);
    stage.hasPlayed = true;
  }

  if (leaderTeam === null || !mod.Equals(winningTeam, leaderTeam)) {
    leaderTeam = winningTeam;

    if (!stage) {
      playVO(mod.VoiceOverEvents2D.ProgressMidWinning, winningTeam);
      playVO(mod.VoiceOverEvents2D.ProgressMidLosing, losingTeam);
    }
  }
}

function getFurthestSpawnPointFromEnemies(respawnedPlayer: mod.Player): mod.Vector | null {
  const players = mod.AllPlayers();
  const spawnsMap: { distance: number; spawnPoint: mod.Vector }[] = [];
  if (spawners.length === 0) return null;

  let furthestSpawnPoint = spawners[0];
  let furthestSpawnPointDistance = 0;

  for (const spawnPointVector of spawners) {
    let nearestPlayerDistance = 999999999;

    for (let i = 0; i < mod.CountOf(players); i++) {
      const player: mod.Player = mod.ValueInArray(players, i);

      if (
        mod.GetSoldierState(player, mod.SoldierStateBool.IsDead) ||
        mod.Equals(mod.GetTeam(player), mod.GetTeam(respawnedPlayer))
      ) continue;

      const playerVector = mod.GetSoldierState(
        player,
        mod.SoldierStateVector.GetPosition
      );

      const distanceBetween = mod.DistanceBetween(
        spawnPointVector,
        playerVector
      );

      nearestPlayerDistance = Math.min(nearestPlayerDistance, distanceBetween);
    }

    spawnsMap.push({
      spawnPoint: spawnPointVector,
      distance: nearestPlayerDistance,
    });

    if (furthestSpawnPointDistance < nearestPlayerDistance) {
      furthestSpawnPointDistance = nearestPlayerDistance;
    }
  }

  const availableSpawns = spawnsMap.filter(
    ({ distance }) => distance >= furthestSpawnPointDistance * 0.8
  );

  // We want a spawn that is among the furthest 20% from enemies, so we randomize among those
  if (availableSpawns.length > 0) {
    const randomIndex = Math.floor(Math.random() * availableSpawns.length);
    return availableSpawns[randomIndex].spawnPoint;
  }

  // Fallback to furthest spawn if no spawns meet criteria somehow
  return furthestSpawnPoint;
}

function createSpawnPoints() {
  let spawnPointId = GAMEMODE_CONFIG.startSpawnPointID;
  if (!spawnPointId) return;

  do {
    const spawnPoint = mod.GetSpatialObject(spawnPointId); // Even with an invalid ID it returns a SpawnObject so we have to check it by "hand"
    const spawnPointPosition = mod.GetObjectPosition(spawnPoint);
    const spawnPointX = mod.XComponentOf(spawnPointPosition);
    const spawnPointY = mod.YComponentOf(spawnPointPosition);
    const spawnPointZ = mod.ZComponentOf(spawnPointPosition);

    // Better check for invalid spawn points - Y and Z being exactly 0 typically indicates invalid position
    if (spawnPointY === 0 && spawnPointZ === 0) break;

    spawners.push(mod.CreateVector(spawnPointX, spawnPointY, spawnPointZ));
    mod.MoveObject(spawnPoint, mod.CreateVector(-100, -100, -100)); // Because EnableSpatial and Unspawn don't work...

    spawnPointId++;
  } while (spawnPointId);
}

function createScoreboard() {
  mod.SetScoreboardType(mod.ScoreboardType.CustomTwoTeams);

  mod.SetScoreboardColumnNames(
    mod.Message(mod.stringkeys.SCOREBOARD_COLUMN1_HEADER),
    mod.Message(mod.stringkeys.SCOREBOARD_COLUMN2_HEADER),
    mod.Message(mod.stringkeys.SCOREBOARD_COLUMN3_HEADER),
    mod.Message(mod.stringkeys.SCOREBOARD_COLUMN4_HEADER),
    mod.Message(mod.stringkeys.SCOREBOARD_COLUMN5_HEADER)
  );

  mod.SetScoreboardHeader(
    mod.Message(mod.stringkeys.UISCORE_TEAM1_NAME),
    mod.Message(mod.stringkeys.UISCORE_TEAM2_NAME)
  );

  mod.SetScoreboardColumnWidths(100, 100, 100, 250, 250);

  // BUG
  // scoreboard sorting using the two parameter overload is 0-based index but documented as 1-based index
  // scoreboard sorting using the single parameter overload is 1-based index
  mod.SetScoreboardSorting(0, false); // Sort by kills descending

  const allPlayers = mod.AllPlayers();

  for (let i = 0; i < mod.CountOf(allPlayers); i++) {
    const player: mod.Player = mod.ValueInArray(allPlayers, i);
    const playerId = mod.GetObjId(player);

    updateScoreboard(player, playersStats[playerId]);
  }
}

const updateScoreboard = (player: mod.Player, playerStats: PlayerStats) => {
  if (!playerStats) return;

  mod.SetScoreboardPlayerValues(
    player,
    playerStats.k,
    playerStats.d,
    playerStats.a,
    (playerStats.k / (playerStats.d > 0 ? playerStats.d : 1)) * 1000, // K/D ratio, hacky since we can't have decimals
    playerStats.k > 0 ? Math.floor((playerStats.hs / playerStats.k) * 100) : 0 // HS% calculation
  );
};

function createBeginningTimer() {
  mod.AddUIContainer(
    UIWIDGET_TIMER_BEGINNING_ID,
    mod.CreateVector(0, -250, 0),
    mod.CreateVector(400, 200, 0),
    mod.UIAnchor.Center,
    mod.GetUIRoot(),
    true,
    0,
    mod.CreateVector(1, 1, 1),
    0.9,
    mod.UIBgFill.OutlineThin
  );

  const UITimerBeginningContainer = mod.FindUIWidgetWithName(UIWIDGET_TIMER_BEGINNING_ID);

  mod.AddUIText(
    UIWIDGET_TIMER_BEGINNING_TEXT_ID,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(300, 300, 0),
    mod.UIAnchor.Center,
    UITimerBeginningContainer,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    mod.Message(
      mod.stringkeys.UISCORE_TIMER_BEGINNING,
      GAMEMODE_CONFIG.freezeTime,
      0
    ),
    120,
    mod.CreateVector(1, 1, 1),
    1,
    mod.UIAnchor.Center
  );
}

function updateBeginningTimer(remainingSeconds: number, remainingMilliseconds: number) {
  const timerBeginningWidgetText = mod.FindUIWidgetWithName(UIWIDGET_TIMER_BEGINNING_TEXT_ID);

  if (timerBeginningWidgetText) {
    const message =
      remainingSeconds > 5
        ? mod.Message(mod.stringkeys.UISCORE_TIMER_BEGINNING, remainingSeconds)
        : mod.Message(
          mod.stringkeys.UISCORE_TIMER_BEGINNING_MS,
          remainingSeconds,
          remainingMilliseconds
        );

    mod.SetUITextLabel(timerBeginningWidgetText, message);
  }
}

function deleteTimerWidget() {
  const timerBeginningWidget = mod.FindUIWidgetWithName(UIWIDGET_TIMER_BEGINNING_ID);

  if (timerBeginningWidget) {
    mod.DeleteUIWidget(timerBeginningWidget);
  }
}

function createUIScore() {
  mod.AddUIContainer(
    UIWIDGET_SCORE_CONTAINER_ID,
    mod.CreateVector(0, 52, 0),
    mod.CreateVector(200, 60, 0),
    mod.UIAnchor.TopCenter,
    mod.GetUIRoot(),
    true,
    0,
    mod.CreateVector(0.2, 0.2, 0.2),
    0.9,
    mod.UIBgFill.Blur
  );

  const UIScoreContainer = mod.FindUIWidgetWithName(UIWIDGET_SCORE_CONTAINER_ID);

  mod.AddUIText(
    UIWIDGET_SCORE_TIMER_ID,
    mod.CreateVector(0, 8, 0),
    mod.CreateVector(200, 10, 0),
    mod.UIAnchor.TopCenter,
    UIScoreContainer,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    mod.Message(mod.stringkeys.UISCORE_SEPARATOR),
    14,
    mod.CreateVector(1, 1, 1),
    1,
    mod.UIAnchor.Center
  );

  mod.AddUIText(
    UIWIDGET_SCORE_TEAM1_SCORE_ID,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(100, 40, 0),
    mod.UIAnchor.CenterLeft,
    UIScoreContainer,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    mod.Message(mod.stringkeys.UISCORE_POINTS, 0),
    20,
    mod.CreateVector(0.439, 0.922, 1),
    1,
    mod.UIAnchor.Center
  );

  mod.AddUIText(
    UIWIDGET_SCORE_TEAM1_NAME_ID,
    mod.CreateVector(0, 5, 0),
    mod.CreateVector(100, 10, 0),
    mod.UIAnchor.BottomLeft,
    UIScoreContainer,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    mod.Message(mod.stringkeys.UISCORE_TEAM1_NAME),
    12,
    mod.CreateVector(0.439, 0.922, 1),
    1,
    mod.UIAnchor.Center
  );

  mod.AddUIText(
    UIWIDGET_SCORE_SEPARATOR_ID,
    mod.CreateVector(0, 10, 0),
    mod.CreateVector(200, 50, 0),
    mod.UIAnchor.TopCenter,
    UIScoreContainer,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    mod.Message(mod.stringkeys.UISCORE_SEPARATOR),
    18,
    mod.CreateVector(1, 1, 1),
    1,
    mod.UIAnchor.Center
  );

  mod.AddUIText(
    UIWIDGET_SCORE_TEAM2_SCORE_ID,
    mod.CreateVector(0, 0, 0),
    mod.CreateVector(100, 40, 0),
    mod.UIAnchor.CenterRight,
    UIScoreContainer,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    mod.Message(mod.stringkeys.UISCORE_POINTS, 0),
    20,
    mod.CreateVector(1, 0.514, 0.38),
    1,
    mod.UIAnchor.Center
  );

  mod.AddUIText(
    UIWIDGET_SCORE_TEAM2_NAME_ID,
    mod.CreateVector(0, 5, 0),
    mod.CreateVector(100, 10, 0),
    mod.UIAnchor.BottomRight,
    UIScoreContainer,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    mod.Message(mod.stringkeys.UISCORE_TEAM2_NAME),
    12,
    mod.CreateVector(1, 0.514, 0.38),
    1,
    mod.UIAnchor.Center
  );

  mod.AddUIText(
    UIWIDGET_SCORE_FIRSTTO_ID,
    mod.CreateVector(0, 1, 0),
    mod.CreateVector(100, 10, 0),
    mod.UIAnchor.BottomCenter,
    UIScoreContainer,
    true,
    0,
    mod.CreateVector(0, 0, 0),
    0,
    mod.UIBgFill.None,
    mod.Message(mod.stringkeys.UISCORE_FIRSTTO, GAMEMODE_CONFIG.score),
    12,
    mod.CreateVector(1, 1, 1),
    1,
    mod.UIAnchor.BottomCenter
  );
}

function updateUIScore() {
  const team1Score = mod.GetGameModeScore(mod.GetTeam(GAMEMODE_CONFIG.team1ID));
  const team2Score = mod.GetGameModeScore(mod.GetTeam(GAMEMODE_CONFIG.team2ID));

  const team1UIScoreWidget = mod.FindUIWidgetWithName(UIWIDGET_SCORE_TEAM1_SCORE_ID);
  const team2UIScoreWidget = mod.FindUIWidgetWithName(UIWIDGET_SCORE_TEAM2_SCORE_ID);

  mod.SetUITextLabel(
    team1UIScoreWidget,
    mod.Message(mod.stringkeys.UISCORE_POINTS, team1Score)
  );

  mod.SetUITextLabel(
    team2UIScoreWidget,
    mod.Message(mod.stringkeys.UISCORE_POINTS, team2Score)
  );
}

function updateTimerText(
  remainingTime: number,
  remainingMinutes: number,
  remainingSeconds: number,
  remainingMilliseconds: number
) {
  const timerWidget = mod.FindUIWidgetWithName(UIWIDGET_SCORE_TIMER_ID);

  if (timerWidget) {
    if (remainingTime < 60) {
      mod.SetUITextColor(timerWidget, mod.CreateVector(0.9, 0, 0));
      mod.SetUITextLabel(
        timerWidget,
        mod.Message(
          mod.stringkeys.UISCORE_TIMER,
          remainingSeconds,
          remainingMilliseconds
        )
      );

      if (remainingSeconds <= 20 && tick % 30 === 0) {
        playSFX(mod.RuntimeSpawn_Common.SFX_Gadgets_C4_Activate_OneShot2D);
      }
    } else {
      if (remainingTime < 120) {
        mod.SetUITextColor(timerWidget, mod.CreateVector(0.9, 0.9, 0));
      }

      mod.SetUITextLabel(
        timerWidget,
        mod.Message(
          remainingSeconds >= 10
            ? mod.stringkeys.UISCORE_TIMER
            : mod.stringkeys.UISCORE_TIMER_PADDED,
          remainingMinutes,
          remainingSeconds
        )
      );
    }
  }
}

function deleteUIScore() {
  const scoreContainerWidget = mod.FindUIWidgetWithName(UIWIDGET_SCORE_CONTAINER_ID);

  if (scoreContainerWidget) {
    mod.DeleteUIWidget(scoreContainerWidget);
  }
}

function removeGadget(player: mod.Player, gadget: mod.Gadgets) {
  if (mod.HasEquipment(player, gadget)) {
    mod.RemoveEquipment(player, gadget);
  }
}

async function endGame(winningTeam: mod.Team, losingTeam: mod.Team) {
  gameEnded = true;

  deleteUIScore();
  mod.EnableAllPlayerDeploy(false);

  await mod.Wait(5);
}

export async function OnGameModeStarted() {
  createSpawnPoints();
  createUIScore();
  createBeginningTimer();

  mod.SetGameModeTargetScore(GAMEMODE_CONFIG.score);
  mod.SetGameModeTimeLimit(GAMEMODE_CONFIG.timeLimit + GAMEMODE_CONFIG.freezeTime);

  createScoreboard();
  await mod.Wait(GAMEMODE_CONFIG.freezeTime);

  gameStarted = true;

  playVO(mod.VoiceOverEvents2D.RoundStartGeneric);
  deleteTimerWidget();
}

export function OnPlayerJoinGame(eventPlayer: mod.Player) {
  const playerId = mod.GetObjId(eventPlayer);
  mod.SetRedeployTime(eventPlayer, 0);

  playersStats[playerId] = {
    k: 0,
    d: 0,
    a: 0,
    hs: 0,
  };

  updateScoreboard(eventPlayer, playersStats[playerId]);
}

export function OnPlayerDeployed(eventPlayer: mod.Player) {
  if (gameStarted) {
    const furthestSpawnPoint = getFurthestSpawnPointFromEnemies(eventPlayer);

    if (furthestSpawnPoint) {
      mod.Teleport(eventPlayer, furthestSpawnPoint, 0);
    }

    for (const gadget of RESTRICTED_GADGETS) {
      removeGadget(eventPlayer, gadget);
    }
  }
}

export function OnPlayerLeaveGame(eventNumber: number) {
  delete playersStats[eventNumber];
}

export function OnPlayerDamaged(
  eventPlayer: mod.Player,
  eventOtherPlayer: mod.Player,
  eventDamageType: mod.DamageType,
  eventWeaponUnlock: mod.WeaponUnlock
) {
  const eventPlayerVector = mod.GetSoldierState(eventPlayer, mod.SoldierStateVector.GetPosition);
  const eventOtherPlayerVector = mod.GetSoldierState(eventOtherPlayer, mod.SoldierStateVector.GetPosition);
  const distanceBetween = Math.trunc(mod.DistanceBetween(eventPlayerVector, eventOtherPlayerVector));

  if (mod.EventDamageTypeCompare(eventDamageType, mod.PlayerDamageTypes.Default)) {

    if (mod.IsInventorySlotActive(eventPlayer, mod.InventorySlots.PrimaryWeapon)) {
      let hasSniper: boolean = SNIPERS.filter(value => mod.HasEquipment(eventOtherPlayer, value)).length > 0;

      if (hasSniper && (distanceBetween >= 0 && distanceBetween <= GAMEMODE_CONFIG.sniperMaxDistanceToHitKill)) {
        mod.DealDamage(eventPlayer, GAMEMODE_CONFIG.sniperAdditionalDamage, eventOtherPlayer);
      }
    }
  }
}

export function OnPlayerEarnedKill(
  eventPlayer: mod.Player,
  eventOtherPlayer: mod.Player,
  eventDeathType: mod.DeathType,
  eventWeaponUnlock: mod.WeaponUnlock
) {
  if (
    mod.EventDeathTypeCompare(eventDeathType, mod.PlayerDeathTypes.Deserting) ||
    mod.EventDeathTypeCompare(eventDeathType, mod.PlayerDeathTypes.Drowning) ||
    mod.EventDeathTypeCompare(eventDeathType, mod.PlayerDeathTypes.Redeploy) ||
    mod.Equals(eventPlayer, eventOtherPlayer)
  ) return;

  const playerId = mod.GetObjId(eventPlayer);
  const playerTeam = mod.GetTeam(eventPlayer);
  const otherPlayerTeam = mod.GetTeam(eventOtherPlayer);

  playersStats[playerId].k++;
  playersStats[playerId].hs += mod.EventDeathTypeCompare(
    eventDeathType,
    mod.PlayerDeathTypes.Headshot
  )
    ? 1
    : 0;

  mod.SetGameModeScore(playerTeam, mod.GetGameModeScore(playerTeam) + 1);

  updateScoreboard(eventPlayer, playersStats[playerId]);
  updateUIScore();

  if (mod.GetGameModeScore(playerTeam) >= GAMEMODE_CONFIG.score) {
    // because the gamemode end doesn't actually end at the score, we have to trigger that "manually"
    endGame(playerTeam, otherPlayerTeam);
  } else {
    playProgressSFX(playerTeam, otherPlayerTeam);
  }
}

export function OnPlayerEarnedKillAssist(eventPlayer: mod.Player, eventOtherPlayer: mod.Player) {
  const playerId = mod.GetObjId(eventPlayer);

  playersStats[playerId].a++;
  updateScoreboard(eventPlayer, playersStats[playerId]);
}

export function OnPlayerUndeploy(eventPlayer: mod.Player) {
  const eventPlayerId = mod.GetObjId(eventPlayer);

  playersStats[eventPlayerId].d++;
  updateScoreboard(eventPlayer, playersStats[eventPlayerId]);
}

export function OngoingPlayer(eventPlayer: mod.Player) {
  if (!mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsDead)) {
    if (!gameStarted || gameEnded) {
      mod.EnableAllInputRestrictions(eventPlayer, true);
    } else {
      mod.EnableAllInputRestrictions(eventPlayer, false);
    }
  }
}

export function OngoingGlobal() {
  tick++; // ONLY increment tick here

  const remainingTime = Math.floor(mod.GetMatchTimeRemaining());
  const remainingMinutes = Math.floor(remainingTime / 60);
  const remainingSeconds = remainingTime % 60;
  const remainingMilliseconds = Math.floor(
    1000 - (tick % 30) * 30 + Math.floor(Math.random() * 10)
  ); // using ticks because ms aren't updated on remaining time, which is why we also use math.round (ms are static in the fn return so useless)

  if (!gameStarted) {
    updateBeginningTimer(remainingSeconds, remainingMilliseconds);
  }

  if (remainingTime < 120 && !hasPlayedTime120LeftVO) {
    playVO(mod.VoiceOverEvents2D.Time120Left);
    hasPlayedTime120LeftVO = true;
  } else if (remainingTime < 60 && !hasPlayedTime60LeftVO) {
    playVO(mod.VoiceOverEvents2D.Time60Left);
    hasPlayedTime60LeftVO = true;
  } else if (remainingTime < 30 && !hasPlayedTime30LeftVO) {
    playVO(mod.VoiceOverEvents2D.Time30Left);
    hasPlayedTime30LeftVO = true;
  } else if (remainingTime === 0 && tick % 30 >= 28) {
    endGame(
      mod.GetTeam(GAMEMODE_CONFIG.team1ID),
      mod.GetTeam(GAMEMODE_CONFIG.team2ID)
    );
  }

  updateTimerText(
    remainingTime,
    remainingMinutes,
    remainingSeconds,
    remainingMilliseconds
  );
}