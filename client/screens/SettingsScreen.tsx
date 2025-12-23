import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Switch,
  Pressable,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";

interface SettingToggleProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  icon: keyof typeof Feather.glyphMap;
}

function SettingToggle({ label, description, value, onValueChange, icon }: SettingToggleProps) {
  const { theme, isDark } = useTheme();

  const handleChange = (newValue: boolean) => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
    onValueChange(newValue);
  };

  return (
    <View style={[styles.settingRow, { borderBottomColor: theme.border }]}>
      <View style={[styles.settingIcon, { backgroundColor: theme.backgroundSecondary }]}>
        <Feather name={icon} size={18} color={theme.link} />
      </View>
      <View style={styles.settingContent}>
        <ThemedText type="body">{label}</ThemedText>
        {description ? (
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {description}
          </ThemedText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={handleChange}
        trackColor={{ false: theme.backgroundTertiary, true: Colors.light.primary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

interface SettingLinkProps {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
}

function SettingLink({ label, icon, onPress }: SettingLinkProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.settingRow,
        { borderBottomColor: theme.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={[styles.settingIcon, { backgroundColor: theme.backgroundSecondary }]}>
        <Feather name={icon} size={18} color={theme.link} />
      </View>
      <View style={styles.settingContent}>
        <ThemedText type="body">{label}</ThemedText>
      </View>
      <Feather name="chevron-right" size={20} color={theme.textSecondary} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme, isDark } = useTheme();

  const [hapticFeedback, setHapticFeedback] = useState(true);
  const [autoFocus, setAutoFocus] = useState(true);
  const [flashDefault, setFlashDefault] = useState(false);
  const [showConfidence, setShowConfidence] = useState(true);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: insets.bottom + Spacing.xl,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        <View style={styles.section}>
          <ThemedText type="caption" style={[styles.sectionHeader, { color: theme.textSecondary }]}>
            APP PREFERENCES
          </ThemedText>
          <View style={[styles.sectionContent, { backgroundColor: theme.backgroundDefault }]}>
            <SettingToggle
              label="Haptic Feedback"
              description="Vibration feedback on actions"
              value={hapticFeedback}
              onValueChange={setHapticFeedback}
              icon="smartphone"
            />
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="caption" style={[styles.sectionHeader, { color: theme.textSecondary }]}>
            CAMERA SETTINGS
          </ThemedText>
          <View style={[styles.sectionContent, { backgroundColor: theme.backgroundDefault }]}>
            <SettingToggle
              label="Auto-Focus"
              description="Automatically focus on documents"
              value={autoFocus}
              onValueChange={setAutoFocus}
              icon="crosshair"
            />
            <SettingToggle
              label="Flash Default On"
              description="Enable flash by default"
              value={flashDefault}
              onValueChange={setFlashDefault}
              icon="zap"
            />
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="caption" style={[styles.sectionHeader, { color: theme.textSecondary }]}>
            CODING PREFERENCES
          </ThemedText>
          <View style={[styles.sectionContent, { backgroundColor: theme.backgroundDefault }]}>
            <SettingToggle
              label="Show Confidence Scores"
              description="Display confidence level for suggestions"
              value={showConfidence}
              onValueChange={setShowConfidence}
              icon="bar-chart-2"
            />
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="caption" style={[styles.sectionHeader, { color: theme.textSecondary }]}>
            ABOUT
          </ThemedText>
          <View style={[styles.sectionContent, { backgroundColor: theme.backgroundDefault }]}>
            <SettingLink
              label="Privacy Policy"
              icon="shield"
              onPress={() => {}}
            />
            <SettingLink
              label="Terms of Use"
              icon="file-text"
              onPress={() => {}}
            />
            <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
              <View style={[styles.settingIcon, { backgroundColor: theme.backgroundSecondary }]}>
                <Feather name="info" size={18} color={theme.link} />
              </View>
              <View style={styles.settingContent}>
                <ThemedText type="body">Version</ThemedText>
              </View>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                1.0.0
              </ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.disclaimerContainer}>
          <Feather name="alert-circle" size={16} color={theme.textSecondary} />
          <ThemedText type="small" style={[styles.disclaimerText, { color: theme.textSecondary }]}>
            MedCode AI provides coding suggestions for reference only. Always verify codes according to official coding guidelines and payer requirements.
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    marginLeft: Spacing.lg,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionContent: {
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
  },
  settingIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  settingContent: {
    flex: 1,
  },
  disclaimerContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  disclaimerText: {
    flex: 1,
    lineHeight: 20,
  },
});
