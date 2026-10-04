/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { registerBackgroundHandler } from './notifications';

// Must run at the top level of the entry file so Notifee can spin up its
// headless task when a notification is delivered or tapped in the background.
registerBackgroundHandler();

AppRegistry.registerComponent(appName, () => App);
