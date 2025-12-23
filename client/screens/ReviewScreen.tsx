import React from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";

import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { getApiUrl } from "@/lib/query-client";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";

type NavigationProp = NativeStackNavigationProp<RootStackParamList, "Review">;
type ReviewRouteProp = RouteProp<RootStackParamList, "Review">;

const DE_IDENTIFIED_FIELDS = [
  { field: "Patient Name", icon: "user" as const },
  { field: "Date of Birth", icon: "calendar" as const },
  { field: "Medical Record Number", icon: "hash" as const },
  { field: "SSN/Insurance ID", icon: "shield" as const },
];

export default function ReviewScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme, isDark } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ReviewRouteProp>();
  const { imageUri, imageBase64 } = route.params;

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/analyze", baseUrl).toString();
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 }),
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Analysis failed" }));
        throw new Error(error.error || "Analysis failed");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      navigation.replace("Results", { scanId: data.scanId });
    },
    onError: (error) => {
      console.error("Analysis failed:", error);
    },
  });

  const handleRetake = () => {
    navigation.goBack();
  };

  const handleAnalyze = () => {
    analyzeMutation.mutate();
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        <View style={[styles.imageContainer, { borderColor: theme.border }]}>
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            resizeMode="contain"
          />
        </View>

        <Card elevation={1} style={styles.deIdentifyCard}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: Colors.light.primaryLight }]}>
              <Feather name="shield" size={20} color={Colors.light.primary} />
            </View>
            <View style={styles.cardHeaderText}>
              <ThemedText type="h4">Privacy Protection</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                The following fields will be masked during analysis
              </ThemedText>
            </View>
          </View>

          <View style={styles.fieldsList}>
            {DE_IDENTIFIED_FIELDS.map((item, index) => (
              <View
                key={item.field}
                style={[
                  styles.fieldItem,
                  index < DE_IDENTIFIED_FIELDS.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
                ]}
              >
                <View style={styles.fieldLeft}>
                  <Feather name={item.icon} size={16} color={theme.textSecondary} />
                  <ThemedText type="body" style={styles.fieldText}>
                    {item.field}
                  </ThemedText>
                </View>
                <View style={[styles.redactedBadge, { backgroundColor: isDark ? Colors.dark.error + "20" : Colors.light.error + "15" }]}>
                  <ThemedText type="caption" style={{ color: isDark ? Colors.dark.error : Colors.light.error }}>
                    REDACTED
                  </ThemedText>
                </View>
              </View>
            ))}
          </View>
        </Card>

        {analyzeMutation.isError ? (
          <View style={[styles.errorBanner, { backgroundColor: Colors.light.error + "15" }]}>
            <Feather name="alert-circle" size={20} color={Colors.light.error} />
            <ThemedText type="small" style={{ color: Colors.light.error, flex: 1 }}>
              Analysis failed. Please try again or retake the photo with better lighting.
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.buttonContainer}>
          <Button
            onPress={handleRetake}
            style={[styles.button, styles.secondaryButton, { borderColor: theme.border }]}
            disabled={analyzeMutation.isPending}
          >
            <View style={styles.buttonContent}>
              <Feather name="refresh-cw" size={18} color={theme.text} />
              <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>Retake</ThemedText>
            </View>
          </Button>

          <Button
            onPress={handleAnalyze}
            style={[styles.button, styles.primaryButton]}
            disabled={analyzeMutation.isPending}
          >
            {analyzeMutation.isPending ? (
              <View style={styles.buttonContent}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <ThemedText type="body" style={{ color: "#FFFFFF", marginLeft: Spacing.sm }}>
                  Analyzing...
                </ThemedText>
              </View>
            ) : (
              <View style={styles.buttonContent}>
                <Feather name="search" size={18} color="#FFFFFF" />
                <ThemedText type="body" style={{ color: "#FFFFFF", marginLeft: Spacing.sm }}>
                  Analyze Document
                </ThemedText>
              </View>
            )}
          </Button>
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
  imageContainer: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  image: {
    width: "100%",
    aspectRatio: 3 / 4,
  },
  deIdentifyCard: {
    marginTop: Spacing.xl,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.lg,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  cardHeaderText: {
    flex: 1,
  },
  fieldsList: {
    marginTop: Spacing.sm,
  },
  fieldItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
  },
  fieldLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  fieldText: {
    marginLeft: Spacing.md,
  },
  redactedBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  buttonContainer: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  button: {
    flex: 1,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
  },
  primaryButton: {
    backgroundColor: Colors.light.primary,
  },
});
