const express = require('express');
const router = express.Router();
const liveEvents = require('../utils/liveEvents');

router.get('/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  const send = (channel) => res.write(`data: ${channel}\n\n`);
  const onPositions = () => send('positions');
  const onAllocations = () => send('weeklyAllocations');

  liveEvents.on('positions:changed', onPositions);
  liveEvents.on('weeklyAllocations:changed', onAllocations);

  // keep-alive ping so proxies/browsers don't time out an idle connection
  const heartbeat = setInterval(() => res.write(':\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    liveEvents.off('positions:changed', onPositions);
    liveEvents.off('weeklyAllocations:changed', onAllocations);
  });
});

module.exports = router;