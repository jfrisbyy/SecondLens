import React from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";

import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { ScanHistory } from "@shared/schema";
import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { getApiUrl } from "@/lib/query-client";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";

type NavigationProp = NativeStackNavigationProp<RootStackParamList, "History">;

function formatDate(dateString: string | Date): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else if (days === 1) {
    return "Yesterday";
  } else if (days < 7) {
    return `${days} days ago`;
  } else {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
}

function HistoryItem({ item, onPress }: { item: ScanHistory; onPress: () => void }) {
  const { theme } = useTheme();
  const codeCount = item.codeSuggestions?.length || 0;

  return (
    <Card elevation={1} onPress={onPress} style={styles.historyCard}>
      <View style={styles.historyContent}>
        <View style={[styles.thumbnail, { backgroundColor: theme.backgroundSecondary }]}>
          <Feather name="file-text" size={24} color={theme.textSecondary} />
        </View>
        <View style={styles.historyInfo}>
          <ThemedText type="h4" numberOfLines={1}>
            Scan #{item.id}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {formatDate(item.createdAt)}
          </ThemedText>
        </View>
        <View style={styles.historyMeta}>
          <View style={[styles.codeBadge, { backgroundColor: Colors.light.primaryLight }]}>
            <ThemedText type="caption" style={{ color: Colors.light.primary }}>
              {codeCount} {codeCount === 1 ? "code" : "codes"}
            </ThemedText>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </View>
      </View>
    </Card>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();

  const { data: scans, isLoading } = useQuery<ScanHistory[]>({
    queryKey: ["/api/scans"],
    queryFn: async () => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/scans", baseUrl).toString();
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch scan history");
      }
      return response.json();
    },
  });

  const handleItemPress = (scanId: number) => {
    navigation.navigate("Results", { scanId });
  };

  if (isLoading) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={theme.link} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={scans || []}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <HistoryItem item={item} onPress={() => handleItemPress(item.id)} />
        )}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
          flexGrow: 1,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconCircle, { backgroundColor: theme.backgroundSecondary }]}>
              <Feather name="inbox" size={48} color={theme.textSecondary} />
            </View>
            <ThemedText type="h3" style={styles.emptyTitle}>
              No scans yet
            </ThemedText>
            <ThemedText type="body" style={[styles.emptyText, { color: theme.textSecondary }]}>
              Your scan history will appear here after you analyze your first medical document.
            </ThemedText>
            <Pressable
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [
                styles.startButton,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Feather name="camera" size={18} color="#FFFFFF" />
              <ThemedText type="body" style={styles.startButtonText}>
                Start Scanning
              </ThemedText>
            </Pressable>
          </View>
        }
      />
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
  },
  historyCard: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  historyContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  historyInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  historyMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  codeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  emptyIconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xl,
  },
  emptyTitle: {
    textAlign: "center",
  },
  emptyText: {
    textAlign: "center",
    marginTop: Spacing.sm,
    lineHeight: 22,
  },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.xl,
    gap: Spacing.sm,
  },
  startButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
