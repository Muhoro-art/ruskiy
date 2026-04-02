import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Colors } from "../../src/constants/colors";
import { api } from "../../src/lib/api";

type Profile = { id: string; displayName: string; segment: string; currentLevel: string; targetLevel: string; domain: string; weeklyHours: number };
type Stats = { streakDays: number; totalXp: number; level: number; totalSessions: number };

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [p, s] = await Promise.allSettled([api.getProfiles(), api.getStats()]);
        if (p.status === "fulfilled" && p.value.length > 0) {
          setProfile(p.value[0] as unknown as Profile);
        }
        if (s.status === "fulfilled") setStats(s.value);
      } catch { /* API unavailable */ }
    }
    load();
  }, []);

  async function handleLogout() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await api.logout();
          router.replace("/");
        },
      },
    ]);
  }

  const segmentLabels: Record<string, string> = {
    teen: "Teen", uni_prep: "University Prep", migrant: "Heritage/Migrant",
    senior: "Senior Learner", kid: "Kids", toddler: "Toddler",
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {profile?.displayName?.substring(0, 2).toUpperCase() || "??"}
            </Text>
          </View>
          <Text style={styles.name}>{profile?.displayName || "Learner"}</Text>
          <Text style={styles.segment}>
            {segmentLabels[profile?.segment || ""] || profile?.segment || "—"}
          </Text>
          <Text style={styles.level}>
            Level {stats?.level ?? 1} · {(stats?.totalXp ?? 0).toLocaleString()} XP
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Learning Settings</Text>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Current Level</Text>
            <Text style={styles.settingValue}>{profile?.currentLevel || "A1"}</Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Target Level</Text>
            <Text style={styles.settingValue}>{profile?.targetLevel || "B2"}</Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Weekly Hours</Text>
            <Text style={styles.settingValue}>{profile?.weeklyHours || 5} hrs</Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Domain</Text>
            <Text style={styles.settingValue}>{profile?.domain || "general"}</Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Sessions</Text>
            <Text style={styles.settingValue}>{stats?.totalSessions ?? 0}</Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Streak</Text>
            <Text style={styles.settingValue}>{stats?.streakDays ?? 0} days</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          <View style={styles.subscriptionCard}>
            <Text style={styles.planName}>Free Plan</Text>
            <Text style={styles.planDesc}>Upgrade for full adaptive engine</Text>
            <Pressable style={styles.upgradeButton}>
              <Text style={styles.upgradeText}>Upgrade to Core — $9.99/mo</Text>
            </Pressable>
          </View>
        </View>

        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20 },
  avatarSection: { alignItems: "center", marginBottom: 32 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.primary, justifyContent: "center", alignItems: "center",
  },
  avatarText: { color: "#fff", fontSize: 28, fontWeight: "700" },
  name: { fontSize: 24, fontWeight: "700", color: Colors.text, marginTop: 12 },
  segment: { fontSize: 14, color: Colors.textMuted, marginTop: 4 },
  level: { fontSize: 14, color: Colors.gold, fontWeight: "600", marginTop: 4 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: Colors.text, marginBottom: 12 },
  settingRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  settingLabel: { fontSize: 16, color: Colors.text },
  settingValue: { fontSize: 16, color: Colors.textMuted },
  subscriptionCard: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: Colors.border,
  },
  planName: { fontSize: 18, fontWeight: "700", color: Colors.text },
  planDesc: { fontSize: 14, color: Colors.textMuted, marginTop: 4 },
  upgradeButton: {
    backgroundColor: Colors.accent, borderRadius: 12,
    paddingVertical: 14, alignItems: "center", marginTop: 16,
  },
  upgradeText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  logoutButton: { paddingVertical: 16, alignItems: "center", marginTop: 8 },
  logoutText: { color: Colors.error, fontSize: 16, fontWeight: "600" },
});
