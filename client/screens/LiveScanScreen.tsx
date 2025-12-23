import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Platform,
  Linking,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useNavigation, useIsFocused } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { CodeSuggestion } from "@shared/schema";
import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { getApiUrl } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, Fonts } from "@/constants/theme";

type NavigationProp = NativeStackNavigationProp<RootStackParamList, "Scan">;

const CAPTURE_INTERVAL = 5000;

function CodeResultCard({ item }: { item: CodeSuggestion }) {
  const { theme, isDark } = useTheme();

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case "High":
        return isDark ? Colors.dark.confidenceHigh : Colors.light.confidenceHigh;
      case "Medium":
        return isDark ? Colors.dark.confidenceMedium : Colors.light.confidenceMedium;
      case "Low":
        return isDark ? Colors.dark.confidenceLow : Colors.light.confidenceLow;
      default:
        return theme.textSecondary;
    }
  };

  return (
    <View style={[styles.codeCard, { backgroundColor: theme.card }]}>
      <View style={styles.codeHeader}>
        <View style={[styles.codeTypeBadge, { backgroundColor: Colors.light.primaryLight }]}>
          <ThemedText type="caption" style={{ color: Colors.light.primary }}>
            {item.codeType}
          </ThemedText>
        </View>
        <ThemedText
          type="h4"
          style={[styles.codeNumber, { fontFamily: Fonts?.mono || "monospace" }]}
        >
          {item.code}
        </ThemedText>
      </View>
      <ThemedText type="small" numberOfLines={2} style={{ color: theme.textSecondary }}>
        {item.description}
      </ThemedText>
      <View style={[styles.confidenceBadge, { backgroundColor: getConfidenceColor(item.confidence) + "20" }]}>
        <View style={[styles.confidenceDot, { backgroundColor: getConfidenceColor(item.confidence) }]} />
        <ThemedText type="caption" style={{ color: getConfidenceColor(item.confidence) }}>
          {item.confidence}
        </ThemedText>
      </View>
    </View>
  );
}

export default function LiveScanScreen() {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const isFocused = useIsFocused();
  const cameraRef = useRef<CameraView>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [flash, setFlash] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detectedCodes, setDetectedCodes] = useState<CodeSuggestion[]>([]);
  const [lastAnalysisTime, setLastAnalysisTime] = useState(0);
  const [analysisCount, setAnalysisCount] = useState(0);

  const scanPulse = useSharedValue(1);

  useEffect(() => {
    if (isScanning) {
      scanPulse.value = withRepeat(
        withTiming(1.2, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      scanPulse.value = 1;
    }
  }, [isScanning]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scanPulse.value }],
  }));

  const analyzeFrame = useCallback(async (base64: string) => {
    if (isAnalyzing) return;

    setIsAnalyzing(true);
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/analyze-live", baseUrl).toString();

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.suggestions && data.suggestions.length > 0) {
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }

          setDetectedCodes((prev) => {
            const existingCodes = new Set(prev.map((c) => c.code));
            const newCodes = data.suggestions.filter(
              (s: CodeSuggestion) => !existingCodes.has(s.code)
            );
            return [...prev, ...newCodes];
          });
          setAnalysisCount((prev) => prev + 1);
        }
      }
    } catch (error) {
      console.error("Live analysis error:", error);
    } finally {
      setIsAnalyzing(false);
      setLastAnalysisTime(Date.now());
    }
  }, [isAnalyzing]);

  useEffect(() => {
    if (!isScanning || !isFocused) return;

    const interval = setInterval(async () => {
      if (!cameraRef.current || isAnalyzing) return;

      const timeSinceLastAnalysis = Date.now() - lastAnalysisTime;
      if (timeSinceLastAnalysis < CAPTURE_INTERVAL) return;

      try {
        const photo = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.5,
          skipProcessing: true,
        });

        if (photo?.base64) {
          analyzeFrame(photo.base64);
        }
      } catch (error) {
        console.error("Frame capture error:", error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isScanning, isFocused, isAnalyzing, lastAnalysisTime, analyzeFrame]);

  const toggleScanning = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setIsScanning(!isScanning);
    if (!isScanning) {
      setDetectedCodes([]);
      setAnalysisCount(0);
    }
  };

  const handleDone = () => {
    setIsScanning(false);
    if (detectedCodes.length > 0) {
      navigation.navigate("LiveResults", { codes: detectedCodes });
    }
  };

  const handleHistory = () => {
    navigation.navigate("History");
  };

  const handleSettings = () => {
    navigation.navigate("Settings");
  };

  if (!permission) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={theme.link} />
      </ThemedView>
    );
  }

  if (!permission.granted) {
    if (permission.status === "denied" && !permission.canAskAgain) {
      return (
        <ThemedView style={[styles.container, styles.centered]}>
          <View style={[styles.webNavBar, { paddingTop: insets.top + Spacing.md }]}>
            <Pressable onPress={handleHistory} style={[styles.navButton, { backgroundColor: theme.card }]}>
              <Feather name="clock" size={22} color={theme.text} />
            </Pressable>
            <ThemedText type="h3">MedCode AI</ThemedText>
            <Pressable onPress={handleSettings} style={[styles.navButton, { backgroundColor: theme.card }]}>
              <Feather name="settings" size={22} color={theme.text} />
            </Pressable>
          </View>
          <View style={[styles.permissionCard, { backgroundColor: theme.card }]}>
            <Feather name="camera-off" size={48} color={theme.textSecondary} />
            <ThemedText type="h3" style={styles.permissionTitle}>
              Camera Access Required
            </ThemedText>
            <ThemedText type="body" style={[styles.permissionText, { color: theme.textSecondary }]}>
              MedCode AI needs camera access to scan medical documents. Please enable it in Settings.
            </ThemedText>
            {Platform.OS !== "web" ? (
              <Button
                onPress={async () => {
                  try {
                    await Linking.openSettings();
                  } catch {}
                }}
                style={styles.permissionButton}
              >
                <ThemedText type="body" style={{ color: "#FFFFFF" }}>
                  Open Settings
                </ThemedText>
              </Button>
            ) : null}
          </View>
        </ThemedView>
      );
    }

    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <View style={[styles.webNavBar, { paddingTop: insets.top + Spacing.md }]}>
          <Pressable onPress={handleHistory} style={[styles.navButton, { backgroundColor: theme.card }]}>
            <Feather name="clock" size={22} color={theme.text} />
          </Pressable>
          <ThemedText type="h3">MedCode AI</ThemedText>
          <Pressable onPress={handleSettings} style={[styles.navButton, { backgroundColor: theme.card }]}>
            <Feather name="settings" size={22} color={theme.text} />
          </Pressable>
        </View>
        <View style={[styles.permissionCard, { backgroundColor: theme.card }]}>
          <Feather name="camera" size={48} color={Colors.light.primary} />
          <ThemedText type="h3" style={styles.permissionTitle}>
            Enable Camera
          </ThemedText>
          <ThemedText type="body" style={[styles.permissionText, { color: theme.textSecondary }]}>
            Point your camera at medical documents to automatically detect and extract relevant coding information.
          </ThemedText>
          <Button onPress={requestPermission} style={styles.permissionButton}>
            <ThemedText type="body" style={{ color: "#FFFFFF" }}>
              Allow Camera Access
            </ThemedText>
          </Button>
        </View>
      </ThemedView>
    );
  }

  if (Platform.OS === "web") {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <View style={[styles.webNavBar, { paddingTop: insets.top + Spacing.md }]}>
          <Pressable onPress={handleHistory} style={[styles.navButton, { backgroundColor: theme.card }]}>
            <Feather name="clock" size={22} color={theme.text} />
          </Pressable>
          <ThemedText type="h3">MedCode AI</ThemedText>
          <Pressable onPress={handleSettings} style={[styles.navButton, { backgroundColor: theme.card }]}>
            <Feather name="settings" size={22} color={theme.text} />
          </Pressable>
        </View>
        <View style={[styles.permissionCard, { backgroundColor: theme.card }]}>
          <Feather name="smartphone" size={48} color={Colors.light.primary} />
          <ThemedText type="h3" style={styles.permissionTitle}>
            Use Expo Go
          </ThemedText>
          <ThemedText type="body" style={[styles.permissionText, { color: theme.textSecondary }]}>
            For the best live scanning experience, scan the QR code from the URL bar to open this app in Expo Go on your mobile device.
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <View style={styles.container}>
      {isFocused ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={flash}
        />
      ) : null}

      <View style={[styles.overlay, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => setFlash(!flash)}
            style={[styles.iconButton, { backgroundColor: flash ? Colors.light.primary : "rgba(0,0,0,0.5)" }]}
          >
            <Feather name={flash ? "zap" : "zap-off"} size={20} color="#FFFFFF" />
          </Pressable>

          <View style={styles.topActions}>
            <Pressable onPress={handleHistory} style={[styles.iconButton, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
              <Feather name="clock" size={20} color="#FFFFFF" />
            </Pressable>
            <Pressable onPress={handleSettings} style={[styles.iconButton, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
              <Feather name="settings" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>

        <View style={styles.frameGuide}>
          <View style={[styles.cornerTL, styles.corner, { borderColor: isScanning ? Colors.light.success : "#FFFFFF" }]} />
          <View style={[styles.cornerTR, styles.corner, { borderColor: isScanning ? Colors.light.success : "#FFFFFF" }]} />
          <View style={[styles.cornerBL, styles.corner, { borderColor: isScanning ? Colors.light.success : "#FFFFFF" }]} />
          <View style={[styles.cornerBR, styles.corner, { borderColor: isScanning ? Colors.light.success : "#FFFFFF" }]} />
        </View>

        {isScanning ? (
          <View style={styles.statusBar}>
            <View style={[styles.statusIndicator, { backgroundColor: "rgba(0,0,0,0.7)" }]}>
              {isAnalyzing ? (
                <ActivityIndicator size="small" color={Colors.light.primary} />
              ) : (
                <Animated.View style={pulseStyle}>
                  <View style={[styles.scanDot, { backgroundColor: Colors.light.success }]} />
                </Animated.View>
              )}
              <ThemedText type="small" style={{ color: "#FFFFFF" }}>
                {isAnalyzing ? "Analyzing..." : "Scanning"}
              </ThemedText>
              {analysisCount > 0 ? (
                <View style={[styles.countBadge, { backgroundColor: Colors.light.primary }]}>
                  <ThemedText type="caption" style={{ color: "#FFFFFF" }}>
                    {analysisCount}
                  </ThemedText>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {detectedCodes.length > 0 ? (
          <View style={[styles.resultsPanel, { paddingBottom: insets.bottom + 100 }]}>
            <FlatList
              data={detectedCodes}
              keyExtractor={(item, index) => `${item.code}-${index}`}
              renderItem={({ item }) => <CodeResultCard item={item} />}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.resultsList}
              ItemSeparatorComponent={() => <View style={{ width: Spacing.sm }} />}
            />
          </View>
        ) : null}

        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.xl }]}>
          {detectedCodes.length > 0 ? (
            <Pressable
              onPress={handleDone}
              style={[styles.doneButton, { backgroundColor: Colors.light.success }]}
            >
              <Feather name="check" size={20} color="#FFFFFF" />
              <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "600" }}>
                Done ({detectedCodes.length} codes)
              </ThemedText>
            </Pressable>
          ) : null}

          <Pressable onPress={toggleScanning} style={styles.scanButtonContainer}>
            <View
              style={[
                styles.scanButtonOuter,
                { borderColor: isScanning ? Colors.light.error : "#FFFFFF" },
              ]}
            >
              <View
                style={[
                  styles.scanButtonInner,
                  {
                    backgroundColor: isScanning ? Colors.light.error : "#FFFFFF",
                    borderRadius: isScanning ? 8 : 30,
                  },
                ]}
              />
            </View>
          </Pressable>

          <ThemedText type="small" style={styles.scanHint}>
            {isScanning ? "Tap to stop scanning" : "Tap to start live scanning"}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  topActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  frameGuide: {
    position: "absolute",
    top: "20%",
    left: "10%",
    right: "10%",
    bottom: "35%",
  },
  corner: {
    position: "absolute",
    width: 30,
    height: 30,
    borderWidth: 3,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 12,
  },
  statusBar: {
    position: "absolute",
    top: "15%",
    alignSelf: "center",
  },
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: Spacing.sm,
  },
  scanDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  countBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    marginLeft: Spacing.xs,
  },
  resultsPanel: {
    position: "absolute",
    bottom: 120,
    left: 0,
    right: 0,
  },
  resultsList: {
    paddingHorizontal: Spacing.lg,
  },
  codeCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    width: 200,
    gap: Spacing.xs,
  },
  codeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  codeTypeBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  codeNumber: {
    letterSpacing: 0.5,
  },
  confidenceBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  confidenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  bottomBar: {
    alignItems: "center",
    gap: Spacing.md,
  },
  doneButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    gap: Spacing.sm,
  },
  scanButtonContainer: {
    alignItems: "center",
  },
  scanButtonOuter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  scanButtonInner: {
    width: 54,
    height: 54,
  },
  scanHint: {
    color: "#FFFFFF",
    opacity: 0.8,
  },
  permissionCard: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    maxWidth: 320,
  },
  permissionTitle: {
    marginTop: Spacing.lg,
    textAlign: "center",
  },
  permissionText: {
    marginTop: Spacing.sm,
    textAlign: "center",
    lineHeight: 22,
  },
  permissionButton: {
    marginTop: Spacing.xl,
    backgroundColor: Colors.light.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  webNavBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  navButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
