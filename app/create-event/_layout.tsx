import { Stack } from 'expo-router';
import { CreateEventProvider } from '../../shared/CreateEventContext';

export default function CreateEventLayout() {
  return (
    <CreateEventProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </CreateEventProvider>
  );
}
