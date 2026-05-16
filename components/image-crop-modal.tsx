import React, { useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Platform,
  Dimensions,
  StatusBar } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming } from "react-native-reanimated";
import {
  DS_COLORS,
  DS_FONT,
  DS_WEIGHT,
  DS_SPACING,
  DS_RADIUS } from "@/lib/design-system";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("screen");
const FRAME_SIZE = SCREEN_W - 64;
const HEADER_H = Platform.OS === "ios" ? 100 : 70;
const FOOTER_H = 80;
const AVAILABLE_H = SCREEN_H - HEADER_H - FOOTER_H;
const FRAME_TOP = Math.max(0, (AVAILABLE_H - FRAME_SIZE) / 2);
const MAX_ZOOM = 5;

/**
 * Clamp a value between min and max.
 * Runs on UI thread (worklet).
 */
function clamp(val: number, min: number, max: number): number {
  "worklet";
  return Math.min(Math.max(val, min), max);
}

interface ImageCropModalProps {
  visible: boolean;
  imageUri: string | null;
  imageWidth: number;
  imageHeight: number;
  onConfirm: (cropRegion: {
    originX: number;
    originY: number;
    width: number;
    height: number;
  }) => void;
  onCancel: () => void;
  saving?: boolean;
}

export function ImageCropModal({
  visible,
  imageUri,
  imageWidth,
  imageHeight,
  onConfirm,
  onCancel,
  saving }: ImageCropModalProps) {
  // Calculate how to size the image so it covers the FRAME_SIZE square
  const { initW, initH } = useMemo(() => {
    if (!imageWidth || !imageHeight)
      return { initW: FRAME_SIZE, initH: FRAME_SIZE };
    const scaleW = FRAME_SIZE / imageWidth;
    const scaleH = FRAME_SIZE / imageHeight;
    const sc = Math.max(scaleW, scaleH);
    return { initW: imageWidth * sc, initH: imageHeight * sc };
  }, [imageWidth, imageHeight]);

  // Shared values for the gesture transforms
  // offset = current position of the image center relative to frame center
  const offset = useSharedValue({ x: 0, y: 0 });
  // scale = current zoom level (1 = fit-to-cover)
  const scale = useSharedValue(1);
  // savedScale = scale at pinch start (used by pinch onChange)
  const savedScale = useSharedValue(1);

  // Reset when modal becomes visible
  React.useEffect(() => {
    if (visible) {
      offset.value = { x: 0, y: 0 };
      scale.value = 1;
      savedScale.value = 1;
    }
  }, [visible]);

  /**
   * Pan gesture — uses onChange (delta-based) for reliable tracking.
   * onChange gives changeX/changeY (deltas since last event),
   * which avoids issues with saved state getting stale during simultaneous gestures.
   */
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(1)
        .onChange((event) => {
          "worklet";
          // The displayed image size is initW*scale x initH*scale.
          // The frame is FRAME_SIZE x FRAME_SIZE.
          // Max offset = how far the image can move before the frame edge
          // goes past the image edge = (displayedDim - FRAME_SIZE) / 2.
          const maxOffsetX = Math.max(0, (initW * scale.value - FRAME_SIZE) / 2);
          const maxOffsetY = Math.max(0, (initH * scale.value - FRAME_SIZE) / 2);
          offset.value = {
            x: clamp(
              offset.value.x + event.changeX,
              -maxOffsetX,
              maxOffsetX
            ),
            y: clamp(
              offset.value.y + event.changeY,
              -maxOffsetY,
              maxOffsetY
            ) };
        }),
    [initW, initH]
  );

  /**
   * Pinch gesture — uses onChange for reliable scale tracking.
   * Also re-clamps offset on every pinch change so the image doesn't
   * drift outside the frame when zooming out.
   */
  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onChange((event) => {
          "worklet";
          // event.scaleChange is the multiplier since last onChange event
          const newScale = clamp(scale.value * event.scaleChange, 1, MAX_ZOOM);
          scale.value = newScale;

          // Re-clamp offset for the new scale
          const maxOffsetX = Math.max(0, (initW * newScale - FRAME_SIZE) / 2);
          const maxOffsetY = Math.max(0, (initH * newScale - FRAME_SIZE) / 2);
          offset.value = {
            x: clamp(offset.value.x, -maxOffsetX, maxOffsetX),
            y: clamp(offset.value.y, -maxOffsetY, maxOffsetY) };
        })
        .onEnd(() => {
          "worklet";
          if (scale.value < 1) {
            scale.value = withTiming(1, { duration: 200 });
            offset.value = { x: 0, y: 0 };
          }
        }),
    [initW, initH]
  );

  // Compose pan + pinch as simultaneous so both work at the same time
  const composed = useMemo(
    () => Gesture.Simultaneous(panGesture, pinchGesture),
    [panGesture, pinchGesture]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    width: initW,
    height: initH,
    transform: [
      { translateX: offset.value.x },
      { translateY: offset.value.y },
      { scale: scale.value },
    ] }));

  /**
   * Calculate crop region in original image coordinates.
   *
   * Transform: [translateX, translateY, scale] — in RN this means
   * scale is applied first (around element center), then translate.
   *
   * Screen position of a pixel at (lx, ly) in the view (top-left origin):
   *   screenX = (lx - initW/2) * s + dx
   *   screenY = (ly - initH/2) * s + dy
   *
   * The frame top-left is at (-FRAME_SIZE/2, -FRAME_SIZE/2) relative to
   * the cropArea center (which is also the image's initial center).
   *
   * Solving for lx when screenX = -FRAME_SIZE/2:
   *   lx = initW/2 + (-FRAME_SIZE/2 - dx) / s
   */
  const handleConfirm = () => {
    const s = scale.value;
    const dx = offset.value.x;
    const dy = offset.value.y;

    // Top-left of the frame in image-view-local coordinates
    const lx = initW / 2 + (-FRAME_SIZE / 2 - dx) / s;
    const ly = initH / 2 + (-FRAME_SIZE / 2 - dy) / s;

    // Convert to original image pixel coordinates
    const originX = Math.max(0, Math.round(lx * (imageWidth / initW)));
    const originY = Math.max(0, Math.round(ly * (imageHeight / initH)));

    // Crop size in original image pixels
    const cropLocalSize = FRAME_SIZE / s;
    const cropW = Math.round(cropLocalSize * (imageWidth / initW));
    const cropH = Math.round(cropLocalSize * (imageHeight / initH));

    // Clamp to image bounds
    const width = Math.min(cropW, imageWidth - originX);
    const height = Math.min(cropH, imageHeight - originY);

    onConfirm({ originX, originY, width, height });
  };

  // Don't render anything when not visible
  if (!visible || !imageUri) return null;

  // Use a full-screen absolute View instead of Modal.
  // On Android, Modal creates a separate window outside the gesture handler tree,
  // which breaks pan and pinch gestures. An absolute overlay stays in the same tree.
  return (
    <View style={cs.fullScreenOverlay}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />
      <View style={cs.container}>
        {/* Header */}
        <View style={cs.header}>
          <TouchableOpacity
            onPress={onCancel}
            style={cs.headerBtn}
            activeOpacity={0.7}
          >
            <Text style={cs.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={cs.headerTitle}>Crop image</Text>
          <TouchableOpacity
            onPress={handleConfirm}
            style={[cs.headerBtn, cs.saveBtn]}
            activeOpacity={0.7}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={DS_COLORS.white} />
            ) : (
              <Text style={cs.saveText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Crop Area */}
        <View style={cs.cropArea}>
          {/* Image layer — user can pan/zoom */}
          <GestureDetector gesture={composed}>
            <Animated.View style={[cs.imageWrapper, animatedStyle]}>
              <Image
                source={{ uri: imageUri }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
              />
            </Animated.View>
          </GestureDetector>

          {/* Overlay with transparent square hole */}
          <View style={cs.overlayContainer} pointerEvents="none">
            {/* Top dark bar */}
            <View style={[cs.overlayBar, { height: FRAME_TOP }]} />
            {/* Middle row */}
            <View style={cs.middleRow}>
              {/* Left dark bar */}
              <View
                style={[
                  cs.overlayBar,
                  {
                    width: (SCREEN_W - FRAME_SIZE) / 2,
                    height: FRAME_SIZE },
                ]}
              />
              {/* Transparent frame */}
              <View style={cs.frame} />
              {/* Right dark bar */}
              <View
                style={[
                  cs.overlayBar,
                  {
                    width: (SCREEN_W - FRAME_SIZE) / 2,
                    height: FRAME_SIZE },
                ]}
              />
            </View>
            {/* Bottom dark bar */}
            <View style={[cs.overlayBar, { flex: 1 }]} />
          </View>
        </View>

        {/* Footer hint */}
        <View style={cs.footer}>
          <Text style={cs.hintText}>
            Drag the image and pinch to resize to select the desired area
          </Text>
        </View>
      </View>
    </View>
  );
}

const cs = StyleSheet.create({
  fullScreenOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: "#000" },
  container: {
    flex: 1,
    backgroundColor: "#000" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: DS_SPACING.lg,
    paddingTop: Platform.OS === "ios" ? 56 : 16,
    paddingBottom: 12,
    height: HEADER_H,
    backgroundColor: "#111" },
  headerBtn: {
    paddingHorizontal: DS_SPACING.md,
    paddingVertical: DS_SPACING.sm,
    borderRadius: DS_RADIUS.md,
    minWidth: 60,
    alignItems: "center" },
  saveBtn: {
    backgroundColor: DS_COLORS.accent },
  headerTitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold as any,
    color: "#fff" },
  cancelText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold as any,
    color: "#aaa" },
  saveText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold as any,
    color: "#fff" },
  cropArea: {
    flex: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center" },
  imageWrapper: {
    position: "absolute" },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject },
  overlayBar: {
    backgroundColor: "rgba(0,0,0,0.6)" },
  middleRow: {
    flexDirection: "row" },
  frame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    borderWidth: 2,
    borderColor: "#fff",
    borderRadius: 4,
    backgroundColor: "transparent" },
  footer: {
    height: FOOTER_H,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: DS_SPACING.xl },
  hintText: {
    fontSize: DS_FONT.body,
    color: "#888",
    textAlign: "left" } });
