-- clock_tick.lua
-- Atomic clock decrement for a game.
--
-- KEYS[1]: clock key (e.g., "clock:{gameId}")
-- ARGV[1]: current timestamp in milliseconds
--
-- The clock hash has fields:
--   whiteTime (seconds, float)
--   blackTime (seconds, float)
--   lastUpdate (milliseconds, integer)
--   isWhiteTurn ("1" for white, "0" for black)
--
-- Returns: [whiteTime, blackTime, timedOut]
--   timedOut: 0 = no timeout, 1 = white timed out, 2 = black timed out

local clockKey = KEYS[1]
local now = tonumber(ARGV[1])

-- Read current clock state
local whiteTime = tonumber(redis.call('HGET', clockKey, 'whiteTime'))
local blackTime = tonumber(redis.call('HGET', clockKey, 'blackTime'))
local lastUpdate = tonumber(redis.call('HGET', clockKey, 'lastUpdate'))
local isWhiteTurn = redis.call('HGET', clockKey, 'isWhiteTurn')

if whiteTime == nil or blackTime == nil or lastUpdate == nil or isWhiteTurn == nil then
  return redis.error_reply("Clock state not found for key: " .. clockKey)
end

-- Calculate elapsed time in seconds
local elapsed = (now - lastUpdate) / 1000.0

-- Decrement the active player's time
if isWhiteTurn == "1" then
  whiteTime = whiteTime - elapsed
  if whiteTime < 0 then whiteTime = 0 end
else
  blackTime = blackTime - elapsed
  if blackTime < 0 then blackTime = 0 end
end

-- Update stored values
redis.call('HSET', clockKey, 'whiteTime', tostring(whiteTime))
redis.call('HSET', clockKey, 'blackTime', tostring(blackTime))
redis.call('HSET', clockKey, 'lastUpdate', tostring(now))

-- Determine timeout status
local timedOut = 0
if whiteTime <= 0 then
  timedOut = 1
elseif blackTime <= 0 then
  timedOut = 2
end

-- Return as array of strings (Redis protocol)
return {tostring(whiteTime), tostring(blackTime), tostring(timedOut)}
