import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { HeaderTitle } from "@/components/HeaderTitle";
import { Feather } from "@expo/vector-icons";
import { Pressable } from "react-native";
import { useTheme } from "@/hooks/useTheme";

import type { CodeSuggestion } from "@shared/schema";

import LiveScanScreen from "@/screens/LiveScanScreen";
import LiveResultsScreen from "@/screens/LiveResultsScreen";
import ReviewScreen from "@/screens/ReviewScreen";
import ResultsScreen from "@/screens/ResultsScreen";
import HistoryScreen from "@/screens/HistoryScreen";
import SettingsScreen from "@/screens/SettingsScreen";

export type RootStackParamList = {
  Scan: undefined;
  Review: { imageUri: string; imageBase64: string };
  Results: { scanId: number };
  LiveResults: { codes: CodeSuggestion[] };
  History: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();
  const { theme } = useTheme();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Scan"
        component={LiveScanScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="Review"
        component={ReviewScreen}
        options={{
          headerTitle: "Review Document",
        }}
      />
      <Stack.Screen
        name="Results"
        component={ResultsScreen}
        options={{
          headerTitle: "Code Suggestions",
        }}
      />
      <Stack.Screen
        name="LiveResults"
        component={LiveResultsScreen}
        options={{
          headerTitle: "Scan Results",
        }}
      />
      <Stack.Screen
        name="History"
        component={HistoryScreen}
        options={{
          presentation: "modal",
          headerTitle: "Scan History",
        }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          headerTitle: "Settings",
        }}
      />
    </Stack.Navigator>
  );
}
