import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { HeaderTitle } from "@/components/HeaderTitle";
import { Feather } from "@expo/vector-icons";
import { Pressable, Platform } from "react-native";
import { useTheme } from "@/hooks/useTheme";

import ScanScreen from "@/screens/ScanScreen";
import ReviewScreen from "@/screens/ReviewScreen";
import ResultsScreen from "@/screens/ResultsScreen";
import HistoryScreen from "@/screens/HistoryScreen";
import SettingsScreen from "@/screens/SettingsScreen";

export type RootStackParamList = {
  Scan: undefined;
  Review: { imageUri: string; imageBase64: string };
  Results: { scanId: number };
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
        component={ScanScreen}
        options={({ navigation }) => ({
          headerTitle: () => <HeaderTitle title="MedCode AI" />,
          headerRight: () => (
            <Pressable
              onPress={() => navigation.navigate("Settings")}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Feather name="settings" size={22} color={theme.text} />
            </Pressable>
          ),
          headerLeft: () => (
            <Pressable
              onPress={() => navigation.navigate("History")}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Feather name="clock" size={22} color={theme.text} />
            </Pressable>
          ),
        })}
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
