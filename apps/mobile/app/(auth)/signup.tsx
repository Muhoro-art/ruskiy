import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Colors } from "../../src/constants/colors";
import { api } from "../../src/lib/api";

export default function SignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Error", "Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      await api.register(email, password);
      router.replace("/(auth)/onboarding");
    } catch (e) {
      Alert.alert("Signup Failed", e instanceof Error ? e.message : "Please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brandRu}>РУССКИЙ</Text>
        <Text style={styles.title}>Create your account</Text>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={Colors.textMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={Colors.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm Password"
          placeholderTextColor={Colors.textMuted}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
        />

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignup}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? "Creating account..." : "Sign Up"}</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/(auth)/login")}>
          <Text style={styles.switchText}>
            Already have an account? <Text style={styles.switchLink}>Sign in</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: Colors.background,
    paddingHorizontal: 24, paddingTop: 80, justifyContent: "center",
  },
  header: { alignItems: "center", marginBottom: 40 },
  brandRu: { fontSize: 36, fontWeight: "800", color: Colors.primary, letterSpacing: 2 },
  title: { fontSize: 20, color: Colors.textMuted, marginTop: 8 },
  form: { gap: 16 },
  input: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 16,
    fontSize: 16, color: Colors.text,
  },
  button: {
    backgroundColor: Colors.accent, borderRadius: 14,
    paddingVertical: 18, alignItems: "center", marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  switchText: { textAlign: "center", color: Colors.textMuted, marginTop: 16, fontSize: 15 },
  switchLink: { color: Colors.primary, fontWeight: "600" },
});
