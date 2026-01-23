-- clock_move.lua
-- Atomic move increment + turn switch for a game clock.
--
-- KEYS[1]: clock key (e.g., "clock:{gameId}")
-- ARGV[1]: current timestamp in milliseconds
-- ARGV[2]: increment in seconds
--
-- The clock hash has fields:
--   whiteTime (seconds, float)
--   blackTime (seconds, float)
--   lastUpdate (milliseconds, integer)
--   isWhiteTurn ("1" for white, "0" for black)
--
-- Returns: [whiteTime, blackTime]

local clockKey = KEYS[1]
local now = tonumber(ARGV[1])
local increment = tonumber(ARGV[2])

-- Read current clock state
local whiteTime = tonumber(redis.call('HGET', clockKey, 'whiteTime'))
local blackTime = tonumber(redis.call('HGET', clockKey, 'blackTime'))
local lastUpdate = tonumber(redis.call('HGET', clockKey, 'lastUpdate'))
local isWhiteTurn = redis.call('HGET', clockKey, 'isWhiteTurn')

if whiteTime == nil or blackTime == nil or lastUpdate == nil or isWhiteTurn == nil then
  return redis.error_reply("Clock state not found for key: " .. clockKey)
end

-- Calculate elapsed time since last update
local elapsed = (now - lastUpdate) / 1000.0

-- Decrement active player's time, add increment, switch turn
if isWhiteTurn == "1" then
  whiteTime = whiteTime - elapsed + increment
  if whiteTime < 0 then whiteTime = 0 end
  -- Switch to black's turn
  redis.call('HSET', clockKey, 'isWhiteTurn', "0")
else
  blackTime = blackTime - elapsed + increment
  if blackTime < 0 then blackTime = 0 end
  -- Switch to white's turn
  redis.call('HSET', clockKey, 'isWhiteTurn', "1")
end

-- Update stored values
redis.call('HSET', clockKey, 'whiteTime', tostring(whiteTime))
redis.call('HSET', clockKey, 'blackTime', tostring(blackTime))
redis.call('HSET', clockKey, 'lastUpdate', tostring(now))

-- Return updated times
return {tostring(whiteTime), tostring(blackTime)}
