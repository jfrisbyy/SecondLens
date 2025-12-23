import React, { useState, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Platform,
  Linking,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";

type NavigationProp = NativeStackNavigationProp<RootStackParamList, "Scan">;

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme, isDark } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const cameraRef = useRef<CameraView>(null);
  
  const [permission, requestPermission] = useCameraPermissions();
  const [flash, setFlash] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) return;
    
    setIsCapturing(true);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.8,
      });
      
      if (photo?.uri && photo?.base64) {
        navigation.navigate("Review", {
          imageUri: photo.uri,
          imageBase64: photo.base64,
        });
      }
    } catch (error) {
      console.error("Failed to capture:", error);
    } finally {
      setIsCapturing(false);
    }
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.uri && asset.base64) {
          navigation.navigate("Review", {
            imageUri: asset.uri,
            imageBase64: asset.base64,
          });
        }
      }
    } catch (error) {
      console.error("Failed to pick image:", error);
    }
  };

  const toggleFlash = () => {
    setFlash(!flash);
    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
  };

  if (!permission) {
    return (
      <ThemedView style={[styles.container, { paddingTop: headerHeight }]}>
        <ActivityIndicator size="large" color={theme.link} />
      </ThemedView>
    );
  }

  if (!permission.granted) {
    if (permission.status === "denied" && !permission.canAskAgain) {
      return (
        <ThemedView style={[styles.container, { paddingTop: headerHeight + Spacing.xl }]}>
          <View style={styles.permissionContainer}>
            <Feather name="camera-off" size={64} color={theme.textSecondary} />
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
                Open Settings
              </Button>
            ) : null}
          </View>
        </ThemedView>
      );
    }

    return (
      <ThemedView style={[styles.container, { paddingTop: headerHeight + Spacing.xl }]}>
        <View style={styles.permissionContainer}>
          <Feather name="camera" size={64} color={theme.link} />
          <ThemedText type="h3" style={styles.permissionTitle}>
            Enable Camera
          </ThemedText>
          <ThemedText type="body" style={[styles.permissionText, { color: theme.textSecondary }]}>
            Allow camera access to scan medical documents and get coding suggestions.
          </ThemedText>
          <Button onPress={requestPermission} style={styles.permissionButton}>
            Enable Camera
          </Button>
          <Pressable onPress={handlePickImage} style={styles.galleryLink}>
            <ThemedText type="link">Or select from gallery</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  if (Platform.OS === "web") {
    return (
      <ThemedView style={[styles.container, { paddingTop: headerHeight + Spacing.xl }]}>
        <View style={styles.permissionContainer}>
          <Feather name="smartphone" size={64} color={theme.link} />
          <ThemedText type="h3" style={styles.permissionTitle}>
            Use Expo Go for Best Experience
          </ThemedText>
          <ThemedText type="body" style={[styles.permissionText, { color: theme.textSecondary }]}>
            For the full camera scanning experience, run this app in Expo Go on your mobile device.
          </ThemedText>
          <Button onPress={handlePickImage} style={styles.permissionButton}>
            Select from Gallery
          </Button>
        </View>
      </ThemedView>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        flash={flash ? "on" : "off"}
      />
      
      <View style={styles.overlay}>
        <View style={[styles.topBanner, { top: headerHeight + Spacing.lg }]}>
          <View style={[styles.bannerContent, { backgroundColor: isDark ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.9)" }]}>
            <Feather name="file-text" size={16} color={theme.text} />
            <ThemedText type="small" style={styles.bannerText}>
              Position document within frame
            </ThemedText>
          </View>
        </View>

        <View style={styles.frameContainer}>
          <View style={styles.documentFrame}>
            <View style={[styles.corner, styles.cornerTopLeft, { borderColor: Colors.light.primary }]} />
            <View style={[styles.corner, styles.cornerTopRight, { borderColor: Colors.light.primary }]} />
            <View style={[styles.corner, styles.cornerBottomLeft, { borderColor: Colors.light.primary }]} />
            <View style={[styles.corner, styles.cornerBottomRight, { borderColor: Colors.light.primary }]} />
          </View>
        </View>

        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.xl }]}>
          <Pressable
            onPress={handlePickImage}
            style={({ pressed }) => [
              styles.sideButton,
              { backgroundColor: isDark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.9)", opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Feather name="image" size={24} color={theme.text} />
          </Pressable>

          <Pressable
            onPress={handleCapture}
            disabled={isCapturing}
            style={({ pressed }) => [
              styles.captureButton,
              { opacity: pressed || isCapturing ? 0.7 : 1 },
            ]}
          >
            {isCapturing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Feather name="camera" size={28} color="#FFFFFF" />
            )}
          </Pressable>

          <Pressable
            onPress={toggleFlash}
            style={({ pressed }) => [
              styles.sideButton,
              { 
                backgroundColor: flash 
                  ? Colors.light.warning 
                  : isDark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.9)",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Feather name={flash ? "zap" : "zap-off"} size={24} color={flash ? "#FFFFFF" : theme.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  permissionContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing["2xl"],
  },
  permissionTitle: {
    marginTop: Spacing.xl,
    textAlign: "center",
  },
  permissionText: {
    marginTop: Spacing.md,
    textAlign: "center",
    lineHeight: 24,
  },
  permissionButton: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing["2xl"],
  },
  galleryLink: {
    marginTop: Spacing.lg,
    padding: Spacing.sm,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  topBanner: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  bannerContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: Spacing.sm,
  },
  bannerText: {
    fontWeight: "500",
  },
  frameContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  documentFrame: {
    width: "80%",
    aspectRatio: 3 / 4,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 40,
    height: 40,
    borderWidth: 4,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 12,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 12,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 12,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing["2xl"],
    paddingTop: Spacing.xl,
  },
  sideButton: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  captureButton: {
    width: Spacing.captureButtonSize,
    height: Spacing.captureButtonSize,
    borderRadius: Spacing.captureButtonSize / 2,
    backgroundColor: Colors.light.primary,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
});
