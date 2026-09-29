import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer('angle');
// Vertical reels are tall; a bit more concurrency keeps renders quick on Apple silicon.
Config.setConcurrency(4);
