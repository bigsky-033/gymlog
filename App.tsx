import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Button, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useEffect, useState } from 'react';
import { testDatabase, cleanupTestData } from './src/database/testDatabase';
import { testServices } from './src/services/testServices';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export default function App() {
  const [testStatus, setTestStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [testOutput, setTestOutput] = useState<string>('');

  // Intercept console.log to capture test output
  const captureConsole = () => {
    const originalLog = console.log;
    const logs: string[] = [];

    console.log = (...args: any[]) => {
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      logs.push(message);
      originalLog(...args);
    };

    return () => {
      console.log = originalLog;
      return logs.join('\n');
    };
  };

  const runTest = async () => {
    setTestStatus('running');
    setTestOutput('');

    const restoreConsole = captureConsole();

    try {
      await testDatabase();
      const output = restoreConsole();
      setTestOutput(output);
      setTestStatus('success');
    } catch (error) {
      const output = restoreConsole();
      setTestOutput(output + '\n\nError: ' + (error instanceof Error ? error.message : String(error)));
      setTestStatus('error');
    }
  };

  const runServiceTests = async () => {
    setTestStatus('running');
    setTestOutput('');

    const restoreConsole = captureConsole();

    try {
      await testServices();
      const output = restoreConsole();
      setTestOutput(output);
      setTestStatus('success');
    } catch (error) {
      const output = restoreConsole();
      setTestOutput(output + '\n\nError: ' + (error instanceof Error ? error.message : String(error)));
      setTestStatus('error');
    }
  };

  const cleanup = async () => {
    try {
      await cleanupTestData();
      alert('Test data cleaned up successfully!');
    } catch (error) {
      alert('Cleanup failed: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const exportDatabase = async () => {
    try {
      // Database file path in expo-sqlite
      const dbPath = `${FileSystem.documentDirectory}SQLite/exercise_tracker.db`;

      // Check if database file exists
      const fileInfo = await FileSystem.getInfoAsync(dbPath);

      if (!fileInfo.exists) {
        Alert.alert('Error', `Database file not found at: ${dbPath}`);
        return;
      }

      // Copy to a shareable location
      const exportPath = `${FileSystem.cacheDirectory}exercise_tracker.db`;
      await FileSystem.copyAsync({
        from: dbPath,
        to: exportPath
      });

      // Share the file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(exportPath, {
          mimeType: 'application/x-sqlite3',
          dialogTitle: 'Export Database'
        });
        Alert.alert('Success', 'Database exported successfully!');
      } else {
        Alert.alert('Info', `Database saved to: ${exportPath}`);
      }
    } catch (error) {
      Alert.alert('Export Failed', error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🧪 Database Test Suite</Text>

      <View style={styles.buttonContainer}>
        <Button
          title="DB Tests"
          onPress={runTest}
          disabled={testStatus === 'running'}
        />
        <Button
          title="Service Tests"
          onPress={runServiceTests}
          disabled={testStatus === 'running'}
          color="#9C27B0"
        />
        <Button
          title="Export DB"
          onPress={exportDatabase}
          color="#4CAF50"
        />
      </View>
      {testStatus === 'success' && (
        <View style={styles.buttonContainer}>
          <Button
            title="Cleanup"
            onPress={cleanup}
            color="#FF6B6B"
          />
        </View>
      )}

      {testStatus === 'running' && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Running tests...</Text>
        </View>
      )}

      {testStatus === 'success' && (
        <View style={styles.statusContainer}>
          <Text style={styles.successText}>✅ All Tests Passed!</Text>
        </View>
      )}

      {testStatus === 'error' && (
        <View style={styles.statusContainer}>
          <Text style={styles.errorText}>❌ Tests Failed</Text>
        </View>
      )}

      {testOutput && (
        <ScrollView style={styles.outputContainer}>
          <Text style={styles.outputText}>{testOutput}</Text>
        </ScrollView>
      )}

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingTop: 50,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
    gap: 10,
  },
  loadingContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  statusContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  successText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  errorText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF3B30',
  },
  outputContainer: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
  },
  outputText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#00ff00',
    lineHeight: 18,
  },
});
