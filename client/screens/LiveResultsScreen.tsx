import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Share,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import type { RootStackParamList, ExtractedData } from "@/navigation/RootStackNavigator";
import type { CodeSuggestion } from "@shared/schema";
import { useTheme } from "@/hooks/useTheme";

interface RelatedCode {
  code: string;
  codeType: "ICD-10" | "CPT";
  description: string;
  reason: string;
}
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Spacing, BorderRadius, Colors, Fonts } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";

type NavigationProp = NativeStackNavigationProp<RootStackParamList, "LiveResults">;
type LiveResultsRouteProp = RouteProp<RootStackParamList, "LiveResults">;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function CodeCard({ item }: { item: CodeSuggestion }) {
  const { theme, isDark } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

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

  const handlePress = () => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
    setExpanded(!expanded);
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={() => {
        scale.value = withSpring(0.98, { damping: 15, stiffness: 150 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 15, stiffness: 150 });
      }}
      style={animatedStyle}
    >
      <Card elevation={1} style={styles.codeCard}>
        <View style={styles.codeHeader}>
          <View style={styles.codeTypeContainer}>
            <View style={[styles.codeTypeBadge, { backgroundColor: Colors.light.primaryLight }]}>
              <ThemedText type="small" style={{ color: Colors.light.primary }}>
                {item.codeType}
              </ThemedText>
            </View>
            <ThemedText
              type="h3"
              style={[styles.codeNumber, { fontFamily: Fonts?.mono || "monospace" }]}
            >
              {item.code}
            </ThemedText>
          </View>
          <View style={styles.confidenceContainer}>
            <View
              style={[
                styles.confidenceBadge,
                { backgroundColor: getConfidenceColor(item.confidence) + "20" },
              ]}
            >
              <View
                style={[
                  styles.confidenceDot,
                  { backgroundColor: getConfidenceColor(item.confidence) },
                ]}
              />
              <ThemedText
                type="small"
                style={{ color: getConfidenceColor(item.confidence) }}
              >
                {item.confidence}
              </ThemedText>
            </View>
          </View>
        </View>

        <ThemedText
          type="body"
          style={styles.codeDescription}
          numberOfLines={expanded ? undefined : 2}
        >
          {item.description}
        </ThemedText>

        {expanded && item.details ? (
          <View style={[styles.detailsContainer, { borderTopColor: theme.border }]}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {item.details}
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.expandRow}>
          <Feather
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={theme.textSecondary}
          />
        </View>
      </Card>
    </AnimatedPressable>
  );
}

export default function LiveResultsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme, isDark } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<LiveResultsRouteProp>();
  const { extractedData } = route.params;

  const [codeSuggestions, setCodeSuggestions] = useState<CodeSuggestion[]>([]);
  const [relatedCodes, setRelatedCodes] = useState<RelatedCode[]>([]);
  const [isLoadingCodes, setIsLoadingCodes] = useState(false);
  const [codesLoaded, setCodesLoaded] = useState(false);

  const handleGetCodes = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    setIsLoadingCodes(true);
    
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/analyze-text-for-codes", baseUrl).toString();

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          extractedText: extractedData.extractedText,
          clinicalContent: extractedData.clinicalContent,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.suggested_codes) {
          setCodeSuggestions(data.suggested_codes);
          setCodesLoaded(true);
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        }
        if (data.related_codes) {
          setRelatedCodes(data.related_codes);
        }
      }
    } catch (error) {
      console.error("Code analysis error:", error);
    } finally {
      setIsLoadingCodes(false);
    }
  };

  const handleShare = async () => {
    let shareText = `MedCode AI - Document Analysis\n\nDocument Type: ${extractedData.documentType}\n\nExtracted Text:\n${extractedData.extractedText}`;
    
    if (codeSuggestions.length > 0) {
      const codeText = codeSuggestions
        .map((c) => `${c.codeType}: ${c.code} - ${c.description} (${c.confidence} confidence)`)
        .join("\n");
      shareText += `\n\nSuggested Codes:\n${codeText}`;
    }

    try {
      await Share.share({
        message: shareText,
        title: "MedCode AI Results",
      });
    } catch {}
  };

  const handleNewScan = () => {
    navigation.popTo("Scan");
  };

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={handleShare}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Feather name="share-2" size={22} color={theme.text} />
        </Pressable>
      ),
    });
  }, [navigation, theme, extractedData, codeSuggestions]);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: insets.bottom + Spacing["4xl"] + 60,
          paddingHorizontal: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        <View style={[styles.successBanner, { backgroundColor: isDark ? Colors.dark.success + "20" : Colors.light.success + "15" }]}>
          <Feather name="shield" size={20} color={isDark ? Colors.dark.success : Colors.light.success} />
          <View style={{ flex: 1 }}>
            <ThemedText type="body" style={{ color: isDark ? Colors.dark.success : Colors.light.success, fontWeight: "600" }}>
              Document De-identified
            </ThemedText>
            <ThemedText type="small" style={{ color: isDark ? Colors.dark.success : Colors.light.success }}>
              {extractedData.redactedFields.length} sensitive field(s) replaced with placeholders
            </ThemedText>
          </View>
        </View>

        <Card elevation={1} style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Feather name="file-text" size={18} color={Colors.light.primary} />
            <ThemedText type="h4" style={{ marginLeft: Spacing.sm, flex: 1 }}>
              {extractedData.documentType}
            </ThemedText>
            <View style={[styles.confidencePill, { 
              backgroundColor: extractedData.confidence === "High" 
                ? Colors.light.success + "20" 
                : extractedData.confidence === "Medium" 
                  ? Colors.light.warning + "20" 
                  : Colors.light.error + "20" 
            }]}>
              <ThemedText type="small" style={{ 
                color: extractedData.confidence === "High" 
                  ? Colors.light.success 
                  : extractedData.confidence === "Medium" 
                    ? Colors.light.warning 
                    : Colors.light.error 
              }}>
                {extractedData.confidence} Confidence
              </ThemedText>
            </View>
          </View>

          <ThemedText type="body" style={styles.extractedText}>
            {extractedData.extractedText}
          </ThemedText>
        </Card>

        {extractedData.clinicalContent.diagnoses && extractedData.clinicalContent.diagnoses.length > 0 ? (
          <Card elevation={1} style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Feather name="activity" size={18} color={Colors.light.error} />
              <ThemedText type="h4" style={{ marginLeft: Spacing.sm }}>
                Diagnoses
              </ThemedText>
            </View>
            {extractedData.clinicalContent.diagnoses.map((d, i) => (
              <View key={i} style={styles.listItem}>
                <View style={[styles.listBullet, { backgroundColor: Colors.light.error }]} />
                <ThemedText type="body" style={{ flex: 1 }}>{d}</ThemedText>
              </View>
            ))}
          </Card>
        ) : null}

        {extractedData.clinicalContent.procedures && extractedData.clinicalContent.procedures.length > 0 ? (
          <Card elevation={1} style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Feather name="scissors" size={18} color={Colors.light.primary} />
              <ThemedText type="h4" style={{ marginLeft: Spacing.sm }}>
                Procedures
              </ThemedText>
            </View>
            {extractedData.clinicalContent.procedures.map((p, i) => (
              <View key={i} style={styles.listItem}>
                <View style={[styles.listBullet, { backgroundColor: Colors.light.primary }]} />
                <ThemedText type="body" style={{ flex: 1 }}>{p}</ThemedText>
              </View>
            ))}
          </Card>
        ) : null}

        {extractedData.clinicalContent.medications && extractedData.clinicalContent.medications.length > 0 ? (
          <Card elevation={1} style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Feather name="droplet" size={18} color={Colors.light.success} />
              <ThemedText type="h4" style={{ marginLeft: Spacing.sm }}>
                Medications
              </ThemedText>
            </View>
            {extractedData.clinicalContent.medications.map((m, i) => (
              <View key={i} style={styles.listItem}>
                <View style={[styles.listBullet, { backgroundColor: Colors.light.success }]} />
                <ThemedText type="body" style={{ flex: 1 }}>{m}</ThemedText>
              </View>
            ))}
          </Card>
        ) : null}

        {!codesLoaded ? (
          <Pressable
            onPress={handleGetCodes}
            disabled={isLoadingCodes}
            style={({ pressed }) => [
              styles.getCodesButton,
              { opacity: pressed ? 0.9 : 1, backgroundColor: Colors.light.primary },
            ]}
          >
            {isLoadingCodes ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Feather name="code" size={20} color="#FFFFFF" />
            )}
            <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "600", marginLeft: Spacing.sm }}>
              {isLoadingCodes ? "Analyzing for Codes..." : "Get Medical Code Suggestions"}
            </ThemedText>
          </Pressable>
        ) : null}

        {codesLoaded && codeSuggestions.length > 0 ? (
          <View style={styles.codesSection}>
            <View style={styles.codesSectionHeader}>
              <Feather name="tag" size={18} color={Colors.light.primary} />
              <ThemedText type="h3" style={{ marginLeft: Spacing.sm }}>
                Suggested Medical Codes
              </ThemedText>
            </View>
            {codeSuggestions.map((item, index) => (
              <CodeCard key={`${item.code}-${index}`} item={item} />
            ))}
          </View>
        ) : null}

        {codesLoaded && codeSuggestions.length === 0 ? (
          <Card elevation={1} style={styles.sectionCard}>
            <View style={styles.emptyCodesContainer}>
              <Feather name="info" size={24} color={theme.textSecondary} />
              <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.sm, textAlign: "center" }}>
                No medical codes could be suggested from this document. Try scanning a document with more clinical details.
              </ThemedText>
            </View>
          </Card>
        ) : null}

        {codesLoaded && relatedCodes.length > 0 ? (
          <View style={styles.relatedSection}>
            <View style={styles.relatedSectionHeader}>
              <Feather name="x-circle" size={18} color={theme.textSecondary} />
              <ThemedText type="h4" style={{ marginLeft: Spacing.sm, color: theme.textSecondary }}>
                Codes Considered But Not Selected
              </ThemedText>
            </View>
            <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>
              These codes were evaluated but excluded based on chart documentation:
            </ThemedText>
            {relatedCodes.map((item, index) => (
              <Card key={`related-${item.code}-${index}`} elevation={0} style={styles.relatedCodeCard}>
                <View style={styles.relatedCodeHeader}>
                  <View style={[styles.codeTypeBadge, { backgroundColor: theme.border }]}>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                      {item.codeType}
                    </ThemedText>
                  </View>
                  <ThemedText
                    type="body"
                    style={[styles.relatedCodeNumber, { color: theme.textSecondary, fontFamily: Fonts?.mono || "monospace" }]}
                  >
                    {item.code}
                  </ThemedText>
                </View>
                <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.xs }}>
                  {item.description}
                </ThemedText>
                <View style={[styles.exclusionReason, { backgroundColor: isDark ? Colors.dark.warning + "10" : Colors.light.warning + "10" }]}>
                  <Feather name="alert-circle" size={14} color={isDark ? Colors.dark.warning : Colors.light.warning} />
                  <ThemedText type="small" style={{ color: isDark ? Colors.dark.warning : Colors.light.warning, flex: 1 }}>
                    {item.reason}
                  </ThemedText>
                </View>
              </Card>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <Pressable
        onPress={handleNewScan}
        style={({ pressed }) => [
          styles.newScanButton,
          { bottom: insets.bottom + Spacing.xl, opacity: pressed ? 0.9 : 1 },
        ]}
      >
        <Feather name="camera" size={18} color="#FFFFFF" />
        <ThemedText type="body" style={styles.newScanText}>
          New Scan
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionCard: {
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  confidencePill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  extractedText: {
    lineHeight: 24,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
    paddingLeft: Spacing.xs,
  },
  listBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 8,
    marginRight: Spacing.sm,
  },
  getCodesButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  codesSection: {
    marginTop: Spacing.lg,
  },
  codesSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  codeCard: {
    paddingVertical: Spacing.lg,
    marginBottom: Spacing.md,
  },
  codeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
  },
  codeTypeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  codeTypeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  codeNumber: {
    letterSpacing: 0.5,
  },
  confidenceContainer: {},
  confidenceBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  confidenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  codeDescription: {
    lineHeight: 22,
  },
  detailsContainer: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
  expandRow: {
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  emptyCodesContainer: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  newScanButton: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    gap: Spacing.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  newScanText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  relatedSection: {
    marginTop: Spacing.xl,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  relatedSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  relatedCodeCard: {
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderStyle: "dashed",
  },
  relatedCodeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  relatedCodeNumber: {
    letterSpacing: 0.5,
  },
  exclusionReason: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.xs,
  },
});
