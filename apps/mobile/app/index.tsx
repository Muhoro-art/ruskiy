import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Colors } from "../src/constants/colors";

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.brandRu}>РУССКИЙ</Text>
        <Text style={styles.brandEn}>RUSSKIY</Text>
        <Text style={styles.tagline}>
          Learn Russian.{"\n"}The Right Way.
        </Text>
        <Text style={styles.subtitle}>
          The only platform built specifically for how English speakers learn
          Russian.
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={styles.primaryButton}
          onPress={() => router.push("/(auth)/signup")}
        >
          <Text style={styles.primaryButtonText}>Get Started Free</Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={() => router.push("/(auth)/login")}
        >
          <Text style={styles.secondaryButtonText}>I have an account</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 100,
    paddingBottom: 50,
  },
  hero: {
    alignItems: "center",
  },
  brandRu: {
    fontSize: 48,
    fontWeight: "800",
    color: Colors.primary,
    letterSpacing: 2,
  },
  brandEn: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textMuted,
    letterSpacing: 4,
    marginTop: 4,
  },
  tagline: {
    fontSize: 32,
    fontWeight: "700",
    color: Colors.text,
    textAlign: "center",
    marginTop: 40,
    lineHeight: 42,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 16,
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  actions: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  secondaryButton: {
    borderWidth: 2,
    borderColor: Colors.primary,
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontSize: 18,
    fontWeight: "700",
  },
});
