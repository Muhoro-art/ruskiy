import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Colors } from "../../src/constants/colors";
import { api } from "../../src/lib/api";

const SEGMENTS = [
  { id: "teen", label: "Teen (13–17)", desc: "Gamified, social learning" },
  { id: "uni_prep", label: "University Prep", desc: "Academic focus, exam readiness" },
  { id: "migrant", label: "Heritage / Migrant", desc: "Practical daily use" },
  { id: "senior", label: "Senior Learner", desc: "Relaxed pace, travel focus" },
];

const LEVELS = [
  { id: "A1", label: "A1 — Beginner", desc: "Cyrillic, greetings, basics" },
  { id: "A2", label: "A2 — Elementary", desc: "Simple conversations" },
  { id: "B1", label: "B1 — Intermediate", desc: "Express opinions, travel" },
  { id: "B2", label: "B2 — Upper Intermediate", desc: "Fluent discussions" },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [segment, setSegment] = useState("");
  const [targetLevel, setTargetLevel] = useState("B1");
  const [loading, setLoading] = useState(false);

  async function handleFinish() {
    if (!displayName || !segment) {
      Alert.alert("Error", "Please complete all fields");
      return;
    }
    setLoading(true);
    try {
      await api.createProfile({
        displayName,
        segment,
        targetLevel,
        weeklyHours: 5,
      });
      router.replace("/(tabs)/learn");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to create profile");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {step === 0 && (
          <View>
            <Text style={styles.stepTitle}>What should we call you?</Text>
            <TextInput
              style={styles.input}
              placeholder="Display name"
              placeholderTextColor={Colors.textMuted}
              value={displayName}
              onChangeText={setDisplayName}
            />
            <Pressable
              style={[styles.button, !displayName && styles.buttonDisabled]}
              onPress={() => displayName && setStep(1)}
              disabled={!displayName}
            >
              <Text style={styles.buttonText}>Next</Text>
            </Pressable>
          </View>
        )}

        {step === 1 && (
          <View>
            <Text style={styles.stepTitle}>How would you describe yourself?</Text>
            <View style={styles.options}>
              {SEGMENTS.map((s) => (
                <Pressable
                  key={s.id}
                  style={[styles.option, segment === s.id && styles.optionSelected]}
                  onPress={() => setSegment(s.id)}
                >
                  <Text style={[styles.optionLabel, segment === s.id && styles.optionLabelSelected]}>
                    {s.label}
                  </Text>
                  <Text style={styles.optionDesc}>{s.desc}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[styles.button, !segment && styles.buttonDisabled]}
              onPress={() => segment && setStep(2)}
              disabled={!segment}
            >
              <Text style={styles.buttonText}>Next</Text>
            </Pressable>
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={styles.stepTitle}>What level do you want to reach?</Text>
            <View style={styles.options}>
              {LEVELS.map((l) => (
                <Pressable
                  key={l.id}
                  style={[styles.option, targetLevel === l.id && styles.optionSelected]}
                  onPress={() => setTargetLevel(l.id)}
                >
                  <Text style={[styles.optionLabel, targetLevel === l.id && styles.optionLabelSelected]}>
                    {l.label}
                  </Text>
                  <Text style={styles.optionDesc}>{l.desc}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleFinish}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? "Setting up..." : "Start Learning!"}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Step indicator */}
      <View style={styles.dots}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.dot, step === i && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 24, paddingTop: 80 },
  stepTitle: {
    fontSize: 26, fontWeight: "800", color: Colors.primary, marginBottom: 24,
  },
  input: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 16,
    fontSize: 18, color: Colors.text, marginBottom: 24,
  },
  options: { gap: 12, marginBottom: 24 },
  option: {
    backgroundColor: Colors.surface, borderWidth: 2, borderColor: Colors.border,
    borderRadius: 14, padding: 16,
  },
  optionSelected: { borderColor: Colors.primary, backgroundColor: "#eff6ff" },
  optionLabel: { fontSize: 17, fontWeight: "700", color: Colors.text },
  optionLabelSelected: { color: Colors.primary },
  optionDesc: { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
  button: {
    backgroundColor: Colors.accent, borderRadius: 14,
    paddingVertical: 18, alignItems: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, paddingBottom: 40 },
  dot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.border,
  },
  dotActive: { backgroundColor: Colors.primary, width: 24 },
});
