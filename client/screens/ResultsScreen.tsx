import React, { useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  Share,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { CodeSuggestion, ScanHistory } from "@shared/schema";
import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { getApiUrl } from "@/lib/query-client";
import { Spacing, BorderRadius, Colors, Fonts } from "@/constants/theme";

type NavigationProp = NativeStackNavigationProp<RootStackParamList, "Results">;
type ResultsRouteProp = RouteProp<RootStackParamList, "Results">;

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
              <ThemedText type="caption" style={{ color: Colors.light.primary }}>
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
                type="caption"
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

export default function ResultsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme, isDark } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ResultsRouteProp>();
  const { scanId } = route.params;

  const { data, isLoading, error } = useQuery<ScanHistory>({
    queryKey: ["/api/scans", scanId],
    queryFn: async () => {
      const baseUrl = getApiUrl();
      const url = new URL(`/api/scans/${scanId}`, baseUrl).toString();
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch scan results");
      }
      return response.json();
    },
  });

  const handleShare = async () => {
    if (!data?.codeSuggestions) return;

    const codeText = data.codeSuggestions
      .map((c) => `${c.codeType}: ${c.code} - ${c.description} (${c.confidence} confidence)`)
      .join("\n\n");

    try {
      await Share.share({
        message: `MedCode AI Suggestions:\n\n${codeText}`,
        title: "Medical Code Suggestions",
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
  }, [navigation, theme, data]);

  if (isLoading) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={theme.link} />
        <ThemedText type="body" style={{ marginTop: Spacing.lg, color: theme.textSecondary }}>
          Loading results...
        </ThemedText>
      </ThemedView>
    );
  }

  if (error || !data) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <Feather name="alert-circle" size={48} color={Colors.light.error} />
        <ThemedText type="h3" style={{ marginTop: Spacing.lg }}>
          Failed to load results
        </ThemedText>
        <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.sm }}>
          Please try scanning again
        </ThemedText>
      </ThemedView>
    );
  }

  const suggestions = data.codeSuggestions || [];

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={suggestions}
        keyExtractor={(item, index) => `${item.code}-${index}`}
        renderItem={({ item }) => <CodeCard item={item} />}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: insets.bottom + Spacing["4xl"] + 60,
          paddingHorizontal: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
        ListHeaderComponent={
          <View style={[styles.successBanner, { backgroundColor: isDark ? Colors.dark.success + "20" : Colors.light.success + "15" }]}>
            <Feather name="check-circle" size={20} color={isDark ? Colors.dark.success : Colors.light.success} />
            <ThemedText type="body" style={{ color: isDark ? Colors.dark.success : Colors.light.success }}>
              Analysis complete - {suggestions.length} codes suggested
            </ThemedText>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Feather name="file-text" size={48} color={theme.textSecondary} />
            <ThemedText type="h3" style={{ marginTop: Spacing.lg }}>
              No codes found
            </ThemedText>
            <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center", marginTop: Spacing.sm }}>
              The document analysis did not return any code suggestions. Try capturing a clearer image.
            </ThemedText>
          </View>
        }
      />

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
  centered: {
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  codeCard: {
    paddingVertical: Spacing.lg,
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
  emptyContainer: {
    alignItems: "center",
    paddingVertical: Spacing["3xl"],
    paddingHorizontal: Spacing.xl,
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
});
