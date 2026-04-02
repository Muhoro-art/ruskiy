import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../src/constants/colors";
import { api } from "../../src/lib/api";

type Stats = {
  streakDays: number;
  totalXp: number;
  level: number;
  totalSessions: number;
  skillsMastered: number;
  skillsLearning: number;
  totalSkills: number;
  currentLevel: string;
};

type SkillState = {
  skillId: string;
  confidence: number;
  status: string;
  totalAttempts: number;
};

export default function ProgressScreen() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [skills, setSkills] = useState<SkillState[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, sk] = await Promise.allSettled([
          api.getStats(),
          api.getLearnerSkills(),
        ]);
        if (s.status === "fulfilled") setStats(s.value);
        if (sk.status === "fulfilled") setSkills(sk.value);
      } catch { /* API unavailable */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  // Group skills by category
  const categories = skills.reduce<Record<string, { total: number; confidence: number }>>((acc, sk) => {
    const cat = sk.skillId.split(".")[0] || "other";
    if (!acc[cat]) acc[cat] = { total: 0, confidence: 0 };
    acc[cat].total++;
    acc[cat].confidence += sk.confidence;
    return acc;
  }, {});

  const categoryColors: Record<string, string> = {
    grammar: "#3b82f6", vocab: "#10b981", phonetics: "#f59e0b",
    pragmatics: "#8b5cf6", script: "#ec4899",
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Progress</Text>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.currentLevel || "A1"}</Text>
            <Text style={styles.statLabel}>Current Level</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.skillsMastered ?? 0}</Text>
            <Text style={styles.statLabel}>Skills Mastered</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.streakDays ?? 0}</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{(stats?.totalXp ?? 0).toLocaleString()}</Text>
            <Text style={styles.statLabel}>Total XP</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Skills Overview</Text>
        {loading ? (
          <Text style={styles.loadingText}>Loading skills...</Text>
        ) : Object.keys(categories).length === 0 ? (
          <Text style={styles.loadingText}>Start practicing to see your skill progress!</Text>
        ) : (
          Object.entries(categories).map(([cat, data]) => {
            const avgConfidence = data.total > 0 ? data.confidence / data.total : 0;
            return (
              <View key={cat} style={styles.skillRow}>
                <View style={styles.skillHeader}>
                  <Text style={styles.skillLabel}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </Text>
                  <Text style={styles.skillPercent}>
                    {Math.round(avgConfidence * 100)}% · {data.total} skills
                  </Text>
                </View>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.max(avgConfidence * 100, 2)}%`,
                        backgroundColor: categoryColors[cat] || "#6b7280",
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })
        )}

        {/* Level info */}
        <View style={styles.levelCard}>
          <Text style={styles.levelTitle}>Level {stats?.level ?? 1}</Text>
          <Text style={styles.levelSub}>
            {stats?.totalXp ?? 0} XP · {stats?.totalSessions ?? 0} sessions completed
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20 },
  title: { fontSize: 28, fontWeight: "800", color: Colors.primary, marginBottom: 20 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 32 },
  statCard: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
    width: "47%", borderWidth: 1, borderColor: Colors.border, alignItems: "center",
  },
  statValue: { fontSize: 28, fontWeight: "800", color: Colors.primary },
  statLabel: { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
  sectionTitle: { fontSize: 20, fontWeight: "700", color: Colors.text, marginBottom: 16 },
  loadingText: { fontSize: 15, color: Colors.textMuted },
  skillRow: { marginBottom: 16 },
  skillHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  skillLabel: { fontSize: 16, fontWeight: "600", color: Colors.text },
  skillPercent: { fontSize: 14, color: Colors.textMuted },
  progressBar: { height: 10, backgroundColor: Colors.border, borderRadius: 5, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 5 },
  levelCard: {
    backgroundColor: Colors.primary, borderRadius: 16, padding: 20, marginTop: 16,
  },
  levelTitle: { fontSize: 22, fontWeight: "800", color: "#fff" },
  levelSub: { fontSize: 14, color: "#94b8d4", marginTop: 4 },
});
