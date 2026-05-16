# White Flash Fix Notes

## Root Causes:
1. The Stack navigator's default background is white
2. When navigating between screens, the underlying layer shows briefly
3. expo-system-ui `setBackgroundColorAsync` sets the native root view color

## Solutions from GitHub issue #27099:
1. Set `contentStyle: { backgroundColor }` on Stack.Screen options
2. Use `animation: "ios_from_right"` to avoid the flash on Android
3. Use `expo-system-ui` to set the root background color at native level:
   ```ts
   import * as SystemUI from 'expo-system-ui';
   SystemUI.setBackgroundColorAsync('#151718'); // dark background
   ```

## Key insight:
The `contentStyle` on Stack screenOptions is already set in our ColorKeyNavigator.
But the NATIVE root view (below React Native) is still white.
We need to call `SystemUI.setBackgroundColorAsync()` when dark mode is active.

## Also important:
- The (tabs) layout needs `sceneStyle` or `sceneContainerStyle` with the background color
- NavigationContainer theme can also help
