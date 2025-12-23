import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Platform,
  Linking,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { DeviceMotion } from "expo-sensors";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useNavigation, useIsFocused } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSpring,
  Easing,
} from "react-native-reanimated";

import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useTheme } from "@/hooks/useTheme";

interface ExtractedData {
  extractedText: string;
  redactedFields: Array<{ fieldType: string; originalPosition: string }>;
  clinicalContent: {
    diagnoses?: string[];
    procedures?: string[];
    medications?: string[];
    labValues?: string[];
    vitalSigns?: string[];
    clinicalNotes?: string;
  };
  documentType: string;
  confidence: string;
  error?: string;
}

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { getApiUrl } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, Fonts } from "@/constants/theme";

type NavigationProp = NativeStackNavigationProp<RootStackParamList, "Scan">;

const STEADY_THRESHOLD = 0.03;
const STEADY_DURATION = 800;
const MIN_CAPTURE_GAP = 4000;

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
  const [isStable, setIsStable] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Tap Start to begin scanning");
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [analysisCount, setAnalysisCount] = useState(0);

  const lastCaptureTimeRef = useRef(0);
  const steadyStartTimeRef = useRef(0);
  const lastRotationRef = useRef({ alpha: 0, beta: 0, gamma: 0 });

  const stabilityProgress = useSharedValue(0);

  const stabilityBarStyle = useAnimatedStyle(() => ({
    width: `${stabilityProgress.value * 100}%`,
  }));

  const analyzeFrame = useCallback(async (base64: string) => {
    if (isAnalyzing) return;

    setIsAnalyzing(true);
    setStatusMessage("Extracting and de-identifying text...");
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/analyze-live", baseUrl).toString();

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });

      if (response.ok) {
        const data: ExtractedData = await response.json();
        
        if (data.extractedText && !data.error) {
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }

          setExtractedData(data);
          setAnalysisCount((prev) => prev + 1);
          setIsScanning(false);
          setStatusMessage("Text extracted successfully!");
        } else if (data.error) {
          setStatusMessage(data.error);
        } else {
          setStatusMessage("No text found. Hold steady on document...");
        }
      }
    } catch (error) {
      console.error("Live analysis error:", error);
      setStatusMessage("Error analyzing. Try again...");
    } finally {
      setIsAnalyzing(false);
      lastCaptureTimeRef.current = Date.now();
    }
  }, [isAnalyzing]);

  const captureAndAnalyze = useCallback(async () => {
    if (!cameraRef.current || isAnalyzing) return;

    const now = Date.now();
    if (now - lastCaptureTimeRef.current < MIN_CAPTURE_GAP) return;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.3,
        skipProcessing: true,
      });

      if (photo?.base64) {
        analyzeFrame(photo.base64);
      }
    } catch (error) {
      console.error("Frame capture error:", error);
    }
  }, [isAnalyzing, analyzeFrame]);

  useEffect(() => {
    if (!isScanning || !isFocused || Platform.OS === "web") return;

    let subscription: { remove: () => void } | null = null;

    const setupMotion = async () => {
      await DeviceMotion.setUpdateInterval(100);

      subscription = DeviceMotion.addListener((data) => {
        if (isAnalyzing) {
          stabilityProgress.value = withTiming(0, { duration: 200 });
          return;
        }

        const rotation = data.rotation;
        if (!rotation) return;

        const last = lastRotationRef.current;
        const deltaAlpha = Math.abs(rotation.alpha - last.alpha);
        const deltaBeta = Math.abs(rotation.beta - last.beta);
        const deltaGamma = Math.abs(rotation.gamma - last.gamma);
        const totalMovement = deltaAlpha + deltaBeta + deltaGamma;

        lastRotationRef.current = {
          alpha: rotation.alpha,
          beta: rotation.beta,
          gamma: rotation.gamma,
        };

        const now = Date.now();

        if (totalMovement < STEADY_THRESHOLD) {
          if (steadyStartTimeRef.current === 0) {
            steadyStartTimeRef.current = now;
          }

          const steadyTime = now - steadyStartTimeRef.current;
          const progress = Math.min(steadyTime / STEADY_DURATION, 1);
          stabilityProgress.value = withTiming(progress, { duration: 100 });

          if (steadyTime >= STEADY_DURATION && !isStable) {
            setIsStable(true);
            setStatusMessage("Steady! Capturing...");
            captureAndAnalyze();
          }
        } else {
          steadyStartTimeRef.current = 0;
          stabilityProgress.value = withTiming(0, { duration: 200 });
          if (isStable) {
            setIsStable(false);
          }
          if (!isAnalyzing) {
            setStatusMessage("Hold camera steady on document...");
          }
        }
      });
    };

    setupMotion();
    setStatusMessage("Hold camera steady on document...");

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [isScanning, isFocused, isAnalyzing, isStable, captureAndAnalyze]);

  const toggleScanning = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (!isScanning) {
      setExtractedData(null);
      setAnalysisCount(0);
      setIsStable(false);
      steadyStartTimeRef.current = 0;
      lastCaptureTimeRef.current = 0;
      stabilityProgress.value = 0;
      setStatusMessage("Hold camera steady on document...");
    } else {
      setStatusMessage("Tap Start to begin scanning");
    }
    setIsScanning(!isScanning);
  };

  const handleNewScan = () => {
    setExtractedData(null);
    setAnalysisCount(0);
    setIsStable(false);
    steadyStartTimeRef.current = 0;
    lastCaptureTimeRef.current = 0;
    stabilityProgress.value = 0;
    setStatusMessage("Hold camera steady on document...");
    setIsScanning(true);
  };

  const handleDone = () => {
    setIsScanning(false);
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
            <View style={[styles.statusIndicator, { backgroundColor: "rgba(0,0,0,0.85)" }]}>
              <View style={styles.statusContent}>
                {isAnalyzing ? (
                  <ActivityIndicator size="small" color={Colors.light.primary} />
                ) : (
                  <Feather 
                    name={isStable ? "check-circle" : "target"} 
                    size={18} 
                    color={isStable ? Colors.light.success : "#FFFFFF"} 
                  />
                )}
                <ThemedText type="small" style={{ color: "#FFFFFF", flex: 1 }}>
                  {statusMessage}
                </ThemedText>
                {analysisCount > 0 ? (
                  <View style={[styles.countBadge, { backgroundColor: Colors.light.primary }]}>
                    <ThemedText type="caption" style={{ color: "#FFFFFF" }}>
                      {analysisCount}
                    </ThemedText>
                  </View>
                ) : null}
              </View>
              <View style={styles.stabilityBarContainer}>
                <Animated.View 
                  style={[
                    styles.stabilityBar, 
                    { backgroundColor: isStable ? Colors.light.success : Colors.light.primary },
                    stabilityBarStyle
                  ]} 
                />
              </View>
            </View>
          </View>
        ) : null}

        {extractedData ? (
          <View style={[styles.extractedResultsPanel, { paddingBottom: insets.bottom + 100 }]}>
            <ScrollView 
              style={styles.extractedScrollView}
              contentContainerStyle={styles.extractedScrollContent}
              showsVerticalScrollIndicator={true}
            >
              <View style={[styles.extractedHeader, { backgroundColor: "rgba(0,0,0,0.9)" }]}>
                <View style={styles.extractedHeaderRow}>
                  <Feather name="file-text" size={20} color={Colors.light.success} />
                  <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "600", marginLeft: Spacing.sm }}>
                    {extractedData.documentType}
                  </ThemedText>
                  <View style={[styles.confidenceBadge, { 
                    backgroundColor: extractedData.confidence === "High" 
                      ? Colors.light.success 
                      : extractedData.confidence === "Medium" 
                        ? Colors.light.warning 
                        : Colors.light.error 
                  }]}>
                    <ThemedText type="caption" style={{ color: "#FFFFFF" }}>
                      {extractedData.confidence}
                    </ThemedText>
                  </View>
                </View>
                {extractedData.redactedFields.length > 0 ? (
                  <View style={styles.redactedInfo}>
                    <Feather name="shield" size={14} color={Colors.light.primary} />
                    <ThemedText type="caption" style={{ color: Colors.light.primary, marginLeft: 4 }}>
                      {extractedData.redactedFields.length} field(s) de-identified
                    </ThemedText>
                  </View>
                ) : null}
              </View>
              
              <View style={[styles.extractedTextBox, { backgroundColor: "rgba(0,0,0,0.85)" }]}>
                <ThemedText type="small" style={{ color: "#FFFFFF", lineHeight: 22 }}>
                  {extractedData.extractedText}
                </ThemedText>
              </View>

              {extractedData.clinicalContent.diagnoses && extractedData.clinicalContent.diagnoses.length > 0 ? (
                <View style={[styles.clinicalSection, { backgroundColor: "rgba(0,0,0,0.85)" }]}>
                  <ThemedText type="small" style={{ color: Colors.light.primary, fontWeight: "600", marginBottom: 4 }}>
                    Diagnoses
                  </ThemedText>
                  {extractedData.clinicalContent.diagnoses.map((d, i) => (
                    <ThemedText key={i} type="caption" style={{ color: "#FFFFFF" }}>
                      - {d}
                    </ThemedText>
                  ))}
                </View>
              ) : null}

              {extractedData.clinicalContent.medications && extractedData.clinicalContent.medications.length > 0 ? (
                <View style={[styles.clinicalSection, { backgroundColor: "rgba(0,0,0,0.85)" }]}>
                  <ThemedText type="small" style={{ color: Colors.light.primary, fontWeight: "600", marginBottom: 4 }}>
                    Medications
                  </ThemedText>
                  {extractedData.clinicalContent.medications.map((m, i) => (
                    <ThemedText key={i} type="caption" style={{ color: "#FFFFFF" }}>
                      - {m}
                    </ThemedText>
                  ))}
                </View>
              ) : null}
            </ScrollView>
          </View>
        ) : null}

        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.xl }]}>
          {extractedData ? (
            <Pressable
              onPress={handleNewScan}
              style={[styles.doneButton, { backgroundColor: Colors.light.primary }]}
            >
              <Feather name="refresh-cw" size={20} color="#FFFFFF" />
              <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "600" }}>
                Scan Another
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    minWidth: 280,
    overflow: "hidden",
  },
  statusContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  stabilityBarContainer: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    marginTop: Spacing.sm,
    overflow: "hidden",
  },
  stabilityBar: {
    height: "100%",
    borderRadius: 2,
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
  extractedResultsPanel: {
    position: "absolute",
    top: "18%",
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: 180,
  },
  extractedScrollView: {
    flex: 1,
    borderRadius: BorderRadius.lg,
  },
  extractedScrollContent: {
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  extractedHeader: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  extractedHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  redactedInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xs,
  },
  extractedTextBox: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  clinicalSection: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
});
