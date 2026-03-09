import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { getUserByEmail } from '../services/authService';

interface ForeignSignUpStep2ScreenProps {
  firstName: string;
  lastName: string;
  middleName?: string;
  countryCode: string;
  phone: string;
  onNext: (data: {
    email: string;
    password: string;
    profileImage?: string;
    cvFile?: any;
    passportPhoto?: string;
    foreignIdCard?: string;
  }) => void;
  onBack: () => void;
}

export function ForeignSignUpStep2Screen({
  firstName,
  lastName,
  middleName,
  countryCode,
  phone,
  onNext,
  onBack,
}: ForeignSignUpStep2ScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [emailExists, setEmailExists] = useState(false);

  const [profileImage, setProfileImage] = useState<string | undefined>(undefined);
  const [cvFile, setCvFile] = useState<any>(undefined);
  const [passportPhoto, setPassportPhoto] = useState<string | undefined>(undefined);
  const [foreignIdCard, setForeignIdCard] = useState<string | undefined>(undefined);

  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleEmailBlur = async () => {
    if (email && validateEmail(email)) {
      try {
        const existingUser = await getUserByEmail(email);
        setEmailExists(!!existingUser);
      } catch (error) {
        console.error('이메일 중복 확인 오류:', error);
      }
    }
  };

  const pickProfileImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Gallery access permission is required.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setProfileImage(result.assets[0].uri);
    }
  };

  const pickCVFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!result.canceled) {
        setCvFile(result.assets[0]);
      }
    } catch (error) {
      console.error('CV file selection error:', error);
      Alert.alert('Error', 'An error occurred while selecting the CV file.');
    }
  };

  const pickPassportPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Gallery access permission is required.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled) {
      setPassportPhoto(result.assets[0].uri);
    }
  };

  const pickForeignIdCard = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Gallery access permission is required.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled) {
      setForeignIdCard(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!email) {
      Alert.alert('Input Error', 'Please enter your email.');
      return;
    }

    if (!validateEmail(email)) {
      Alert.alert('Input Error', 'Please enter a valid email address.');
      return;
    }

    if (!password) {
      Alert.alert('Input Error', 'Please enter your password.');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Input Error', 'Password must be at least 8 characters long.');
      return;
    }

    if (!passwordRegex.test(password)) {
      Alert.alert(
        'Input Error',
        'Password must contain letters, numbers, and special characters.'
      );
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Input Error', 'Passwords do not match.');
      return;
    }

    if (!profileImage) {
      Alert.alert('Input Error', 'Please upload a profile photo.');
      return;
    }

    if (!cvFile) {
      Alert.alert('Input Error', 'Please upload your CV (PDF).');
      return;
    }

    if (!passportPhoto) {
      Alert.alert('Input Error', 'Please upload your Passport Photo.');
      return;
    }

    setIsLoading(true);
    try {
      const existingUser = await getUserByEmail(email);
      if (existingUser) {
        setEmailExists(true);
        Alert.alert('Input Error', 'This email is already in use.');
        setIsLoading(false);
        return;
      }

      onNext({
        email,
        password,
        profileImage,
        cvFile,
        passportPhoto,
        foreignIdCard,
      });
    } catch (error) {
      console.error('Account information verification error:', error);
      Alert.alert('Error', 'An error occurred while verifying account information.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Foreign Teacher Sign Up</Text>
            <Text style={styles.subtitle}>Please upload your account information and documents</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.stepIndicator}>Step 2/2: Account Information & Documents</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[
                  styles.input,
                  emailExists && styles.inputError,
                ]}
                placeholder="Enter your email address"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setEmailExists(false);
                }}
                onBlur={handleEmailBlur}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!isLoading}
              />
              {emailExists && (
                <Text style={styles.errorText}>This email is already in use.</Text>
              )}
              <Text style={styles.warningText}>
                Please double-check your email for any typos
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Enter your password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  editable={!isLoading}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeButton}
                >
                  <Text style={styles.eyeButtonText}>
                    {showPassword ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  editable={!isLoading}
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={styles.eyeButton}
                >
                  <Text style={styles.eyeButtonText}>
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Profile Photo *</Text>
              <TouchableOpacity
                style={styles.uploadButton}
                onPress={pickProfileImage}
                disabled={isLoading}
              >
                <Ionicons name="image-outline" size={24} color="#3b82f6" />
                <Text style={styles.uploadButtonText}>
                  {profileImage ? 'Change Profile Photo' : 'Upload Profile Photo'}
                </Text>
              </TouchableOpacity>
              {profileImage && (
                <Image source={{ uri: profileImage }} style={styles.previewImage} />
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>CV (PDF) *</Text>
              <TouchableOpacity
                style={styles.uploadButton}
                onPress={pickCVFile}
                disabled={isLoading}
              >
                <Ionicons name="document-text-outline" size={24} color="#3b82f6" />
                <Text style={styles.uploadButtonText}>
                  {cvFile ? cvFile.name : 'Upload CV (PDF Format)'}
                </Text>
              </TouchableOpacity>
              {cvFile && (
                <Text style={styles.fileInfo}>Selected file: {cvFile.name}</Text>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Passport Photo *</Text>
              <TouchableOpacity
                style={styles.uploadButton}
                onPress={pickPassportPhoto}
                disabled={isLoading}
              >
                <Ionicons name="card-outline" size={24} color="#3b82f6" />
                <Text style={styles.uploadButtonText}>
                  {passportPhoto ? 'Change Passport Photo' : 'Upload Passport Photo'}
                </Text>
              </TouchableOpacity>
              {passportPhoto && (
                <Image source={{ uri: passportPhoto }} style={styles.previewImage} />
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Alien Registration Card (Optional)</Text>
              <TouchableOpacity
                style={styles.uploadButton}
                onPress={pickForeignIdCard}
                disabled={isLoading}
              >
                <Ionicons name="card-outline" size={24} color="#64748b" />
                <Text style={[styles.uploadButtonText, styles.uploadButtonTextOptional]}>
                  {foreignIdCard ? 'Change Alien Registration Card' : 'Upload Alien Registration Card'}
                </Text>
              </TouchableOpacity>
              {foreignIdCard && (
                <Image source={{ uri: foreignIdCard }} style={styles.previewImage} />
              )}
            </View>

            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[styles.button, styles.buttonOutline]}
                onPress={onBack}
                disabled={isLoading}
                activeOpacity={0.7}
              >
                <Text style={styles.buttonOutlineText}>Back</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.button,
                  styles.buttonPrimary,
                  (isLoading || emailExists) && styles.buttonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={isLoading || emailExists}
                activeOpacity={0.7}
              >
                {isLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.buttonText}>Complete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  header: {
    marginBottom: 30,
    marginTop: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
  },
  form: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  stepIndicator: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 4,
  },
  warningText: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 4,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  eyeButton: {
    paddingHorizontal: 16,
  },
  eyeButtonText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 20,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  uploadButtonText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '500',
  },
  uploadButtonTextOptional: {
    color: '#64748b',
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginTop: 12,
    resizeMode: 'cover',
  },
  fileInfo: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 8,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonOutline: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  buttonOutlineText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonPrimary: {
    backgroundColor: '#10b981',
  },
  buttonDisabled: {
    backgroundColor: '#94a3b8',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
