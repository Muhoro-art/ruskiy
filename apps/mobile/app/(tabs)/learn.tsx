import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../src/constants/colors";

export default function LearnScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>Привет!</Text>
          <Text style={styles.streakBadge}>5 day streak</Text>
        </View>

        {/* Today's Session */}
        <Pressable style={styles.sessionCard}>
          <Text style={styles.sessionTitle}>Today&apos;s Session</Text>
          <Text style={styles.sessionDesc}>
            15 min · Grammar + Vocabulary · 14 exercises
          </Text>
          <View style={styles.startButton}>
            <Text style={styles.startButtonText}>Start Learning</Text>
          </View>
        </Pressable>

        {/* Quick Review */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Review</Text>
          <Text style={styles.sectionDesc}>3 skills need refreshing</Text>
          <View style={styles.skillCards}>
            {[
              { name: "Accusative Case", confidence: 0.45, emoji: "📝" },
              { name: "Soft Consonants", confidence: 0.52, emoji: "🗣️" },
              { name: "Numbers 1-20", confidence: 0.61, emoji: "🔢" },
            ].map((skill) => (
              <Pressable key={skill.name} style={styles.skillCard}>
                <Text style={styles.skillEmoji}>{skill.emoji}</Text>
                <Text style={styles.skillName}>{skill.name}</Text>
                <View style={styles.confidenceBar}>
                  <View
                    style={[
                      styles.confidenceFill,
                      {
                        width: `${skill.confidence * 100}%`,
                        backgroundColor:
                          skill.confidence < 0.5 ? Colors.error : Colors.warning,
                      },
                    ]}
                  />
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Curriculum Path */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Path</Text>
          <View style={styles.pathItems}>
            {[
              { name: "Cyrillic Basics", status: "completed" },
              { name: "Greetings & Introductions", status: "completed" },
              { name: "Nominative Case", status: "current" },
              { name: "Numbers & Counting", status: "locked" },
              { name: "Accusative Case", status: "locked" },
            ].map((item) => (
              <View
                key={item.name}
                style={[
                  styles.pathItem,
                  item.status === "completed" && styles.pathCompleted,
                  item.status === "current" && styles.pathCurrent,
                  item.status === "locked" && styles.pathLocked,
                ]}
              >
                <Text
                  style={[
                    styles.pathText,
                    item.status === "locked" && styles.pathTextLocked,
                  ]}
                >
                  {item.status === "completed" ? "✓ " : ""}
                  {item.name}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  greeting: { fontSize: 28, fontWeight: "800", color: Colors.primary },
  streakBadge: {
    backgroundColor: Colors.gold + "20",
    color: Colors.gold,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    fontSize: 13,
    fontWeight: "700",
  },
  sessionCard: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
  },
  sessionTitle: { fontSize: 22, fontWeight: "700", color: "#fff" },
  sessionDesc: { fontSize: 14, color: "#94b8d4", marginTop: 8 },
  startButton: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  startButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: "700",
  },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 20, fontWeight: "700", color: Colors.text },
  sectionDesc: { fontSize: 14, color: Colors.textMuted, marginTop: 4 },
  skillCards: { gap: 12, marginTop: 12 },
  skillCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  skillEmoji: { fontSize: 24, marginBottom: 8 },
  skillName: { fontSize: 16, fontWeight: "600", color: Colors.text },
  confidenceBar: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    marginTop: 8,
    overflow: "hidden",
  },
  confidenceFill: { height: "100%", borderRadius: 3 },
  pathItems: { gap: 8, marginTop: 12 },
  pathItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  pathCompleted: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  pathCurrent: {
    backgroundColor: "#eff6ff",
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  pathLocked: {
    opacity: 0.5,
  },
  pathText: { fontSize: 16, fontWeight: "600", color: Colors.text },
  pathTextLocked: { color: Colors.textMuted },
});
