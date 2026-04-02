import { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors } from "../../src/constants/colors";
import { api } from "../../src/lib/api";

type Exercise = {
  type: string;
  role: string;
  data: Record<string, unknown>;
  contentId: string;
};

export default function PracticeScreen() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [sessionId, setSessionId] = useState("");
  const [learnerId, setLearnerId] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [totalXP, setTotalXP] = useState(0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [results, setResults] = useState<boolean[]>([]);

  async function startSession() {
    setLoading(true);
    try {
      const lid = await AsyncStorage.getItem("learner_id");
      if (!lid) {
        Alert.alert("No Profile", "Please create a profile first.");
        setLoading(false);
        return;
      }
      setLearnerId(lid);
      const session = await api.generateSession(lid, 10);
      setSessionId(session.id);

      const mapped: Exercise[] = session.items
        .filter((i) => i.content)
        .map((i) => ({
          type: i.content!.exerciseType || i.content!.contentType,
          role: i.role,
          data: i.content!.contentData as Record<string, unknown>,
          contentId: i.contentId,
        }));

      if (mapped.length > 0) {
        setExercises(mapped);
        setCurrentIdx(0);
        setResults([]);
        setTotalXP(0);
        setDone(false);
      } else {
        Alert.alert("No Exercises", "No content available. Try again later.");
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not start session");
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(answer: string) {
    if (submitted) return;
    setSelected(answer);
  }

  async function handleSubmit() {
    if (!selected || submitted) return;
    const ex = exercises[currentIdx];
    const correctAnswer = String(ex.data.correctAnswer || "");
    const isCorrect = selected === correctAnswer;
    setCorrect(isCorrect);
    setSubmitted(true);
    setResults([...results, isCorrect]);
    setTotalXP((prev) => prev + (isCorrect ? 15 : 3));

    if (sessionId) {
      try {
        await api.submitAnswer(sessionId, {
          contentId: ex.contentId, learnerId,
          response: selected, correctAnswer, isCorrect,
          responseTimeMs: 5000, hintLevelUsed: 0,
        });
      } catch { /* non-fatal */ }
    }
  }

  async function handleNext() {
    if (currentIdx + 1 >= exercises.length) {
      setDone(true);
      if (sessionId) {
        try { await api.completeSession(sessionId); } catch { /* */ }
      }
    } else {
      setCurrentIdx(currentIdx + 1);
      setSelected(null);
      setSubmitted(false);
    }
  }

  if (exercises.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.title}>Practice</Text>
          <Text style={styles.subtitle}>Targeted exercises for your weak spots</Text>
          <Pressable
            style={[styles.startBtn, loading && styles.startBtnDisabled]}
            onPress={startSession}
            disabled={loading}
          >
            <Text style={styles.startBtnText}>
              {loading ? "Loading..." : "Start Quick Practice"}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (done) {
    const correctCount = results.filter(Boolean).length;
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.doneState}>
          <Text style={styles.doneTitle}>Practice Complete!</Text>
          <Text style={styles.doneStats}>
            {correctCount}/{results.length} correct · +{totalXP} XP
          </Text>
          <Pressable style={styles.startBtn} onPress={startSession}>
            <Text style={styles.startBtnText}>Practice Again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const ex = exercises[currentIdx];
  const options = [
    String(ex.data.correctAnswer || ""),
    ...((ex.data.distractors as string[]) || []),
  ].sort(() => Math.random() - 0.5);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.progressRow}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${(currentIdx / exercises.length) * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>{currentIdx + 1}/{exercises.length}</Text>
          <Text style={styles.xpText}>+{totalXP} XP</Text>
        </View>

        {ex.data.promptRu && <Text style={styles.promptRu}>{String(ex.data.promptRu)}</Text>}
        <Text style={styles.promptEn}>{String(ex.data.promptEn || "")}</Text>

        <View style={styles.optionsList}>
          {options.map((opt) => {
            const isSelected = selected === opt;
            const isCorrectAnswer = opt === String(ex.data.correctAnswer);
            let optStyle = styles.option;
            if (submitted && isCorrectAnswer) optStyle = styles.optionCorrect;
            else if (submitted && isSelected && !correct) optStyle = styles.optionWrong;
            else if (isSelected) optStyle = styles.optionActive;

            return (
              <Pressable key={opt} style={optStyle} onPress={() => handleSelect(opt)}>
                <Text style={styles.optionText}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>

        {submitted && ex.data.explanationEn && (
          <View style={styles.explanation}>
            <Text style={styles.explanationText}>{String(ex.data.explanationEn)}</Text>
          </View>
        )}

        {!submitted ? (
          <Pressable
            style={[styles.actionBtn, !selected && styles.actionBtnDisabled]}
            onPress={handleSubmit} disabled={!selected}
          >
            <Text style={styles.actionBtnText}>Check</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.actionBtn} onPress={handleNext}>
            <Text style={styles.actionBtnText}>
              {currentIdx + 1 >= exercises.length ? "Finish" : "Next"}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20 },
  emptyState: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  title: { fontSize: 28, fontWeight: "800", color: Colors.primary },
  subtitle: { fontSize: 16, color: Colors.textMuted, marginTop: 8, textAlign: "center" },
  startBtn: { backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 18, paddingHorizontal: 40, marginTop: 32 },
  startBtnDisabled: { opacity: 0.5 },
  startBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  doneState: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  doneTitle: { fontSize: 28, fontWeight: "800", color: Colors.primary, marginTop: 16 },
  doneStats: { fontSize: 18, color: Colors.textMuted, marginTop: 8 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 24 },
  progressBar: { flex: 1, height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: Colors.primary, borderRadius: 4 },
  progressText: { fontSize: 13, color: Colors.textMuted },
  xpText: { fontSize: 13, fontWeight: "700", color: Colors.success },
  promptRu: { fontSize: 28, fontWeight: "700", color: Colors.primary, textAlign: "center", marginBottom: 8 },
  promptEn: { fontSize: 18, color: Colors.text, textAlign: "center", marginBottom: 24 },
  optionsList: { gap: 12 },
  option: { backgroundColor: Colors.surface, borderWidth: 2, borderColor: Colors.border, borderRadius: 14, padding: 16 },
  optionActive: { backgroundColor: "#eff6ff", borderWidth: 2, borderColor: Colors.primary, borderRadius: 14, padding: 16 },
  optionCorrect: { backgroundColor: "#f0fdf4", borderWidth: 2, borderColor: Colors.success, borderRadius: 14, padding: 16 },
  optionWrong: { backgroundColor: "#fef2f2", borderWidth: 2, borderColor: Colors.error, borderRadius: 14, padding: 16 },
  optionText: { fontSize: 16, fontWeight: "600", color: Colors.text },
  explanation: { backgroundColor: "#eff6ff", borderRadius: 12, padding: 16, marginTop: 16 },
  explanationText: { fontSize: 14, color: Colors.primary, lineHeight: 20 },
  actionBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 18, alignItems: "center", marginTop: 24 },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },
});
