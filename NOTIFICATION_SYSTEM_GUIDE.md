# Modern Notification System & Progress Tracker Guide

## Overview
This guide shows how to integrate the new notification system and progress tracker across all dashboards.

## Components Created

### 1. **Toast Notifications** (Replaces alert())
Location: `client/src/components/Toast.tsx`

### 2. **Notification Center** (Bell icon with history)
Location: `client/src/components/NotificationCenter.tsx`

### 3. **Progress Tracker** (Patient journey visualization)
Location: `client/src/components/ProgressTracker.tsx`

### 4. **Notification Context** (Global state management)
Location: `client/src/context/NotificationContext.tsx`

---

## How to Use Toast Notifications

### Replace alert() with showToast()

**Before:**
```typescript
alert('Patient vitals saved successfully!');
```

**After:**
```typescript
import { useNotification } from '../context/NotificationContext';

const { showToast } = useNotification();

showToast('Patient vitals saved successfully!', 'success');
```

### Toast Types
- `'success'` - Green toast with checkmark
- `'error'` - Red toast with X icon
- `'warning'` - Amber toast with warning icon
- `'info'` - Blue toast with info icon (default)

### Examples

```typescript
// Success
showToast('Order placed successfully!', 'success');

// Error
showToast('Failed to save data', 'error');

// Warning
showToast('Patient has allergies to this medication', 'warning');

// Info
showToast('Doctor has been notified', 'info');
```

---

## How to Add Notification Center to Dashboard Header

```typescript
import NotificationCenter from '../components/NotificationCenter';

// In your dashboard header (next to logout button):
<div className="flex items-center gap-4">
  <NotificationCenter />
  <button onClick={logout} className="...">
    Logout
  </button>
</div>
```

---

## How to Add Progress Tracker

### Full Version (Nurse/Doctor Dashboard)

```typescript
import ProgressTracker from '../components/ProgressTracker';

<ProgressTracker
  hasVitals={!!selectedPatient.vital_signs}
  hasHPStarted={true}
  labOrders={labOrders}
  pharmacyOrders={pharmacyOrders}
  imagingOrders={imagingOrders}
  encounterStatus={selectedPatient.status}
/>
```

### Compact Version (Lab/Pharmacy/Imaging Dashboard)

```typescript
<ProgressTracker
  hasVitals={!!patient.vital_signs}
  labOrders={labOrders}
  pharmacyOrders={pharmacyOrders}
  imagingOrders={imagingOrders}
  compact={true}
/>
```

---

## Dashboard Implementation Checklist

### ✅ Nurse Dashboard
- [x] Progress Tracker added
- [ ] Replace all alert() with showToast()
- [ ] Add NotificationCenter to header

### ⬜ Doctor Dashboard
- [ ] Progress Tracker
- [ ] Replace all alert() with showToast()
- [ ] Add NotificationCenter to header

### ⬜ Receptionist Dashboard
- [ ] Progress Tracker (compact version)
- [ ] Replace all alert() with showToast()
- [ ] Add NotificationCenter to header

### ⬜ Lab Dashboard
- [ ] Progress Tracker (compact version)
- [ ] Replace all alert() with showToast()
- [ ] Add NotificationCenter to header

### ⬜ Pharmacy Dashboard
- [ ] Progress Tracker (compact version)
- [ ] Replace all alert() with showToast()
- [ ] Add NotificationCenter to header

### ⬜ Imaging Dashboard
- [ ] Progress Tracker (compact version)
- [ ] Replace all alert() with showToast()
- [ ] Add NotificationCenter to header

---

## Examples of alert() to Replace

### Common Patterns to Find and Replace:

**1. Success Messages:**
```typescript
// OLD:
alert('Lab order updated successfully');

// NEW:
showToast('Lab order updated successfully', 'success');
```

**2. Error Messages:**
```typescript
// OLD:
alert('Error: ' + error.message);

// NEW:
showToast(`Error: ${error.message}`, 'error');
```

**3. Confirmation Messages:**
```typescript
// OLD (confirmation):
if (confirm('Are you sure you want to delete?')) {
  // Still use confirm() for confirmations
  // But replace success alert:
  await deleteItem();
  showToast('Item deleted successfully', 'success');
}
```

**4. Info Messages:**
```typescript
// OLD:
alert('Doctor has been notified');

// NEW:
showToast('Doctor has been notified', 'info');
```

---

## Progress Tracker States

The progress tracker automatically calculates stages:

- **15%** - Checked In / Room Assigned
- **30%** - Vitals Recorded
- **45%** - H&P / Assessment In Progress
- **65%** - Doctor Orders Placed
- **85%** - All Orders Complete
- **100%** - Encounter Completed

### Order Status Badges

When orders exist, color-coded badges appear:
- 🟢 **Green** - All completed ✓
- 🔵 **Blue (pulsing)** - In progress ⏳
- 🟡 **Amber** - Pending ⏸

---

## Testing

1. **Test Toast Notifications:**
   ```typescript
   showToast('Test success message', 'success');
   showToast('Test error message', 'error');
   showToast('Test warning message', 'warning');
   showToast('Test info message', 'info');
   ```

2. **Test Notification Center:**
   - Click bell icon in header
   - Verify notifications appear in dropdown
   - Test "Clear All" button
   - Test individual notification dismissal

3. **Test Progress Tracker:**
   - Verify progress updates as patient moves through workflow
   - Verify order badges appear when orders are placed
   - Verify animations work smoothly

---

## Design Features

### Toast Notifications
- ✨ Slide-in animation from right
- ⏱️ Auto-dismiss after 4 seconds
- 🎨 Color-coded by type
- 📍 Fixed position top-right
- ✖️ Manual dismiss button

### Notification Center
- 🔔 Bell icon with badge counter
- 📜 Scrollable notification history (last 50)
- ⏰ Relative timestamps ("2 minutes ago")
- 🗑️ Clear individual or all notifications
- 🎯 Click-outside to close

### Progress Tracker
- 📊 Animated gradient progress bar
- 🎯 6 milestone markers
- 🏷️ Live stage label
- 🎨 Glass-morphism design
- ⚡ Smooth transitions
- 📱 Responsive layout

---

## Next Steps

1. **Update all dashboards** to use NotificationCenter in header
2. **Replace all alert()** calls with showToast()
3. **Add ProgressTracker** to each patient view
4. **Test thoroughly** on each dashboard
5. **Deploy** and gather user feedback

---

## Support

If you encounter issues:
1. Check browser console for errors
2. Verify NotificationProvider is wrapping App in main.tsx
3. Ensure imports are correct
4. Test with simple showToast() calls first

Happy coding! 🚀
