import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
    Animated,
    Easing,
    Modal,
    Switch,
    StatusBar,
    Linking,
    Platform,
    ToastAndroid,
    PermissionsAndroid,
    KeyboardAvoidingView,
} from 'react-native';
import { Camera as RNCamera, CameraType } from 'react-native-camera-kit';
import checkinService from '../Api-Services/checkinService';
import eventsService from '../Api-Services/eventsService';

// ==========================================
// PURE REACT NATIVE VECTOR ICONS (Zero-Dependency)
// ==========================================
const Icon = ({ name, size = 18, color = '#ffffff', style }) => {
    const iconMap = {
        QrCode: '☵',
        CheckCircle: '✓',
        XCircle: '✕',
        AlertTriangle: '⚠',
        Loader2: '◌',
        User: '👤',
        Calendar: '📅',
        Clock: '🕒',
        RefreshCw: '↻',
        ArrowLeft: '←',
        ShieldAlert: '🛡!',
        ShieldCheck: '🛡✓',
        Building: '🏢',
        Briefcase: '💼',
        Search: '🔍',
        Camera: '📷',
        CameraOff: '🚫',
        Check: '✓',
        HelpCircle: '?',
        Lightbulb: '💡',
        ExternalLink: '↗',
        Gift: '🎁',
    };

    const glyph = iconMap[name] || '•';

    return (
        <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
            <Text style={{ fontSize: size * 0.82, color, fontWeight: '700', textAlign: 'center' }}>
                {glyph}
            </Text>
        </View>
    );
};

// Aliases matching Lucide imports
const QrCode = (props) => <Icon name="QrCode" {...props} />;
const CheckCircle = (props) => <Icon name="CheckCircle" {...props} />;
const XCircle = (props) => <Icon name="XCircle" {...props} />;
const AlertTriangle = (props) => <Icon name="AlertTriangle" {...props} />;
const Loader2 = (props) => <Icon name="Loader2" {...props} />;
const User = (props) => <Icon name="User" {...props} />;
const Calendar = (props) => <Icon name="Calendar" {...props} />;
const Clock = (props) => <Icon name="Clock" {...props} />;
const RefreshCw = (props) => <Icon name="RefreshCw" {...props} />;
const ArrowLeft = (props) => <Icon name="ArrowLeft" {...props} />;
const ShieldAlert = (props) => <Icon name="ShieldAlert" {...props} />;
const ShieldCheck = (props) => <Icon name="ShieldCheck" {...props} />;
const Building = (props) => <Icon name="Building" {...props} />;
const Briefcase = (props) => <Icon name="Briefcase" {...props} />;
const Search = (props) => <Icon name="Search" {...props} />;
const Camera = (props) => <Icon name="Camera" {...props} />;
const CameraOff = (props) => <Icon name="CameraOff" {...props} />;
const Check = (props) => <Icon name="Check" {...props} />;
const HelpCircle = (props) => <Icon name="HelpCircle" {...props} />;
const Lightbulb = (props) => <Icon name="Lightbulb" {...props} />;
const ExternalLink = (props) => <Icon name="ExternalLink" {...props} />;
const Gift = (props) => <Icon name="Gift" {...props} />;

/**
 * Scanning State Machine:
 * IDLE             -> Camera active or waiting to scan
 * PROCESSING       -> Synchronously locked, verifying scanned pass with backend
 * RESULT_DISPLAYED -> Verification result displayed (attendee card, pass status)
 * CHECKING_IN      -> Check-in request in progress
 * SUCCESS          -> Entry approved and recorded
 * ERROR            -> Verification or network error displayed
 */
const SCAN_STATES = {
    IDLE: 'IDLE',
    PROCESSING: 'PROCESSING',
    RESULT_DISPLAYED: 'RESULT_DISPLAYED',
    CHECKING_IN: 'CHECKING_IN',
    SUCCESS: 'SUCCESS',
    ERROR: 'ERROR',
};

const ERROR_CONFIGS = {
    EVENT_ACCESS_DENIED: {
        title: 'Event Access Denied',
        explanation: 'You do not have permission or an active gatekeeper assignment for this event.',
        action: 'Please select an event you are assigned to, or request a Super Admin to assign you as a gatekeeper.',
        severity: 'warning',
        color: 'amber',
    },
    PASS_EVENT_MISMATCH: {
        title: 'Pass Belongs to Different Event',
        explanation: 'This pass was generated for a different event than the one currently selected in the scanner.',
        action: 'Check the event name printed on the physical pass and choose that event from the dropdown selector.',
        severity: 'danger',
        color: 'rose',
    },
    PASS_NOT_ACTIVATED: {
        title: 'Pass Not Activated',
        explanation: 'The attendee has not completed registration or activated this pass yet.',
        action: 'Ask the attendee to scan the pass QR code with their mobile camera to complete registration.',
        severity: 'warning',
        color: 'amber',
    },
    PASS_ALREADY_CHECKED_IN: {
        title: 'Pass Already Checked In',
        explanation: 'This pass has already been admitted for this day or session. Duplicate entry is not permitted.',
        action: 'Check the admission timestamp or verify attendee identity if re-entry assistance is needed.',
        severity: 'warning',
        color: 'orange',
    },
    PASS_REVOKED: {
        title: 'Pass Revoked',
        explanation: 'This pass has been cancelled or invalidated by event administration.',
        action: 'Entry cannot be granted. Direct the attendee to event support or customer helpdesk.',
        severity: 'danger',
        color: 'red',
    },
    PASS_NOT_VALID_FOR_DAY: {
        title: 'Not Valid for Today',
        explanation: 'This pass does not include entry permission for this specific day or session.',
        action: 'Review the permitted event days listed on the pass or switch the active check-in day if appropriate.',
        severity: 'warning',
        color: 'amber',
    },
    INVALID_QR_TOKEN: {
        title: 'Invalid Pass QR Code',
        explanation: 'The scanned code is not recognized as a valid EventPass credential.',
        action: 'Ensure the QR code is clearly lit and undamaged, or manually enter the pass identifier.',
        severity: 'danger',
        color: 'rose',
    },
    NO_EVENT_SELECTED: {
        title: 'No Event Selected',
        explanation: 'An active event must be chosen before scanning passes.',
        action: 'Select an event from the top event selector.',
        severity: 'info',
        color: 'blue',
    },
    VERIFICATION_FAILED: {
        title: 'Verification Failed',
        explanation: 'The pass could not be verified against the server.',
        action: 'Check network connectivity and scan the pass again.',
        severity: 'danger',
        color: 'rose',
    },
};

const getScanErrorDisplay = (code, rawMessage) => {
    const normalizedCode = (code || '').toUpperCase().trim();
    if (ERROR_CONFIGS[normalizedCode]) {
        return {
            code: normalizedCode,
            ...ERROR_CONFIGS[normalizedCode],
            rawMessage,
        };
    }

    // Fallback heuristic detection if raw server message matches known patterns
    const lowerMsg = (rawMessage || '').toLowerCase();
    if (lowerMsg.includes('not authorized') || lowerMsg.includes('access denied')) {
        return {
            code: 'EVENT_ACCESS_DENIED',
            ...ERROR_CONFIGS.EVENT_ACCESS_DENIED,
            rawMessage,
        };
    }
    if (lowerMsg.includes('different event') || lowerMsg.includes('mismatch')) {
        return {
            code: 'PASS_EVENT_MISMATCH',
            ...ERROR_CONFIGS.PASS_EVENT_MISMATCH,
            rawMessage,
        };
    }
    if (lowerMsg.includes('not activated')) {
        return {
            code: 'PASS_NOT_ACTIVATED',
            ...ERROR_CONFIGS.PASS_NOT_ACTIVATED,
            rawMessage,
        };
    }
    if (lowerMsg.includes('already checked in')) {
        return {
            code: 'PASS_ALREADY_CHECKED_IN',
            ...ERROR_CONFIGS.PASS_ALREADY_CHECKED_IN,
            rawMessage,
        };
    }
    if (lowerMsg.includes('revoked')) {
        return {
            code: 'PASS_REVOKED',
            ...ERROR_CONFIGS.PASS_REVOKED,
            rawMessage,
        };
    }
    if (lowerMsg.includes('not valid for') || lowerMsg.includes('day')) {
        return {
            code: 'PASS_NOT_VALID_FOR_DAY',
            ...ERROR_CONFIGS.PASS_NOT_VALID_FOR_DAY,
            rawMessage,
        };
    }

    return {
        code: normalizedCode || 'VERIFICATION_FAILED',
        title: 'Scan Notice',
        explanation: rawMessage || 'Pass verification could not be completed.',
        action: 'Please verify the pass details and try scanning again.',
        severity: 'danger',
        color: 'rose',
        rawMessage,
    };
};

/**
 * @param {{
 *   eventId?: string;
 *   navigation?: any;
 *   route?: any;
 *   onLogout?: () => void;
 * }} [props]
 */
const CheckinScan = ({ eventId: propEventId, navigation, route, onLogout } = {}) => {
    // Support both React Navigation parameters and direct props
    const paramEventId = route?.params?.eventId;

    // Events & Days selection
    const [events, setEvents] = useState([]);
    const [selectedEventId, setSelectedEventId] = useState(propEventId || paramEventId || '');
    const [eventDays, setEventDays] = useState([]);
    const [selectedDayId, setSelectedDayId] = useState('');
    const [eventSearch, setEventSearch] = useState('');

    // Dropdown Picker Modals
    const [isEventPickerVisible, setIsEventPickerVisible] = useState(false);
    const [isDayPickerVisible, setIsDayPickerVisible] = useState(false);

    // State Machine
    const [scanState, setScanState] = useState(SCAN_STATES.IDLE);
    const [verificationResult, setVerificationResult] = useState(null);
    const [checkInResult, setCheckInResult] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    const [errorCode, setErrorCode] = useState(null);

    // In-App Toast Notification
    const [toastMessage, setToastMessage] = useState(null);
    const toastAnim = useRef(new Animated.Value(0)).current;

    const showToast = useCallback((msg, type = 'info') => {
        if (Platform.OS === 'android') {
            ToastAndroid.show(msg, ToastAndroid.SHORT);
        }
        setToastMessage({ text: msg, type });
        Animated.sequence([
            Animated.timing(toastAnim, {
                toValue: 1,
                duration: 250,
                useNativeDriver: true,
            }),
            Animated.delay(2600),
            Animated.timing(toastAnim, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }),
        ]).start(() => {
            setToastMessage(null);
        });
    }, [toastAnim]);

    const toast = useMemo(
        () => ({
            success: (msg) => showToast(msg, 'success'),
            error: (msg) => showToast(msg, 'error'),
            warning: (msg) => showToast(msg, 'warning'),
            info: (msg) => showToast(msg, 'info'),
        }),
        [showToast]
    );

    // Computed error presentation
    const errorDisplay = useMemo(() => {
        if (!errorCode && !errorMessage) return null;
        return getScanErrorDisplay(errorCode, errorMessage);
    }, [errorCode, errorMessage]);

    // Filtered events for quick searchable dropdown
    const filteredEvents = useMemo(() => {
        if (!eventSearch.trim()) return events;
        const q = eventSearch.toLowerCase().trim();
        return events.filter(
            (ev) =>
                ev.name?.toLowerCase().includes(q) ||
                ev.eventCode?.toLowerCase().includes(q)
        );
    }, [events, eventSearch]);

    // Scanner UI & Camera
    const [isScanning, setIsScanning] = useState(false);
    const [cameraPermission, setCameraPermission] = useState('granted');
    const [cameraError, setCameraError] = useState(null);
    const [manualInput, setManualInput] = useState('');
    const [autoCheckIn, setAutoCheckIn] = useState(false);
    const [goodiesProvided, setGoodiesProvided] = useState(false);
    const [eventStats, setEventStats] = useState(null);

    // Animations
    const scanLineAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        let scanLoop;
        let pulseLoop;
        if (isScanning) {
            scanLoop = Animated.loop(
                Animated.sequence([
                    Animated.timing(scanLineAnim, {
                        toValue: 1,
                        duration: 1800,
                        easing: Easing.linear,
                        useNativeDriver: true,
                    }),
                    Animated.timing(scanLineAnim, {
                        toValue: 0,
                        duration: 1800,
                        easing: Easing.linear,
                        useNativeDriver: true,
                    }),
                ])
            );
            pulseLoop = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.05,
                        duration: 900,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 900,
                        useNativeDriver: true,
                    }),
                ])
            );
            scanLoop.start();
            pulseLoop.start();
        } else {
            scanLineAnim.setValue(0);
            pulseAnim.setValue(1);
        }
        return () => {
            scanLoop?.stop();
            pulseLoop?.stop();
        };
    }, [isScanning, scanLineAnim, pulseAnim]);

    // Synchronous Guards (Refs prevent frame-rate callback storms & duplicate requests)
    const isLockedRef = useRef(false);
    const scanStateRef = useRef(SCAN_STATES.IDLE);
    const lastScannedPayloadRef = useRef(null);
    const abortControllerRef = useRef(null);

    // Sync ref with state
    const setMachineState = (newState) => {
        scanStateRef.current = newState;
        setScanState(newState);
    };

    const generateRequestId = () => {
        return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    };

    // Helper to extract identifier from URL, JSON, or plain string
    const parseQrPayload = (raw) => {
        if (!raw) return '';
        const trimmed = String(raw).trim();

        // 1. JSON
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
                const parsed = JSON.parse(trimmed);
                return parsed.passNumber || parsed.token || parsed.rawToken || parsed.passId || trimmed;
            } catch { }
        }

        // 2. URL parsing
        if (
            trimmed.startsWith('http://') ||
            trimmed.startsWith('https://') ||
            trimmed.includes('/activate') ||
            trimmed.includes('/pass/')
        ) {
            try {
                // Query param extraction
                const queryParams = ['passNumber', 'token', 'rawToken', 'passId'];
                for (const q of queryParams) {
                    const match = trimmed.match(new RegExp(`[?&]${q}=([^&#]+)`));
                    if (match && match[1]) {
                        return decodeURIComponent(match[1]);
                    }
                }

                // Path /activate/{token}
                const actMatch = trimmed.match(/\/activate\/([^/?#]+)/);
                if (actMatch && actMatch[1]) {
                    return decodeURIComponent(actMatch[1]);
                }

                // Path /pass/{token}
                const passMatch = trimmed.match(/\/pass\/([^/?#]+)/);
                if (passMatch && passMatch[1]) {
                    return decodeURIComponent(passMatch[1]);
                }
            } catch { }
        }

        return trimmed;
    };

    // Load events
    useEffect(() => {
        const fetchEvents = async () => {
            try {
                const res = await eventsService.getEvents(0, 50);
                const list = res?.data?.content || [];
                setEvents(list);
                if (!selectedEventId && list.length > 0) {
                    setSelectedEventId(list[0].id);
                }
            } catch (err) {
                console.error('Failed to load events:', err);
            }
        };
        fetchEvents();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // When selected event changes, load event days
    useEffect(() => {
        if (!selectedEventId) {
            setEventDays([]);
            setSelectedDayId('');
            return;
        }

        const fetchDays = async () => {
            try {
                const res = await eventsService.getEventDays(selectedEventId);
                const days = res?.data || [];
                setEventDays(days);

                if (days.length > 0) {
                    const todayStr = new Date().toISOString().split('T')[0];
                    const matchingDay = days.find((d) => d.eventDate === todayStr);
                    setSelectedDayId(matchingDay ? matchingDay.id : days[0].id);
                } else {
                    setSelectedDayId('');
                }
            } catch (err) {
                console.error('Failed to load event days:', err);
            }
        };

        fetchDays();
    }, [selectedEventId]);

    // Load Check-In & Goodies distribution stats for selected event/day
    const fetchEventStats = useCallback(async () => {
        if (!selectedEventId) {
            setEventStats(null);
            return;
        }
        try {
            const res = await checkinService.getCheckinStats(selectedEventId, selectedDayId || null);
            if (res && res.data) {
                setEventStats(res.data);
            }
        } catch (e) {
            // Non-critical, ignore
        }
    }, [selectedEventId, selectedDayId]);

    useEffect(() => {
        fetchEventStats();
    }, [fetchEventStats]);

    // Stop scanner safely
    const stopScanner = useCallback(() => {
        setIsScanning(false);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            isLockedRef.current = true;
            stopScanner();
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [stopScanner]);

    // Execute verification logic with duplicate prevention
    const processPassVerification = async (rawDecodedText) => {
        if (!rawDecodedText) return;

        const normalizedToken = parseQrPayload(rawDecodedText);
        if (!normalizedToken) {
            setMachineState(SCAN_STATES.ERROR);
            setErrorCode('INVALID_QR');
            setErrorMessage('The scanned QR code is empty or not formatted correctly.');
            toast.error('Invalid QR code format');
            return;
        }

        if (!selectedEventId) {
            setMachineState(SCAN_STATES.ERROR);
            setErrorCode('NO_EVENT_SELECTED');
            setErrorMessage('Please select an event before scanning passes.');
            toast.error('Please select an event');
            return;
        }

        // Cancel any in-flight request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        try {
            // 1. Verify pass with backend
            const response = await checkinService.verifyPass(
                normalizedToken,
                selectedEventId,
                selectedDayId || null
            );

            const data = response?.data || response;
            setVerificationResult(data);

            // Auto-check-in if enabled and pass is ready
            if (autoCheckIn && data?.eligibleForCheckIn) {
                await executeCheckIn(normalizedToken, data);
            } else {
                setMachineState(SCAN_STATES.RESULT_DISPLAYED);
                if (data?.eligibleForCheckIn) {
                    toast.success(`Pass Verified: ${data.attendeeName || 'Attendee'}`);
                } else {
                    toast.warning(data?.message || 'Verification Notice');
                }
            }
        } catch (err) {
            setMachineState(SCAN_STATES.ERROR);
            const code = err.errorCode || err.response?.data?.errorCode || 'VERIFICATION_FAILED';
            const msg =
                err.message ||
                err.response?.data?.message ||
                'Failed to verify pass. Please verify the event assignment.';
            setErrorCode(code);
            setErrorMessage(msg);
            toast.error(msg);
        }
    };

    // Perform final Check-In mutation
    const executeCheckIn = async (passIdentifier = null, verifiedData = null) => {
        const rawTarget = passIdentifier || lastScannedPayloadRef.current || manualInput;
        const targetToken = parseQrPayload(rawTarget);
        if (!targetToken || !selectedEventId) return;

        setMachineState(SCAN_STATES.CHECKING_IN);

        try {
            const requestId = generateRequestId();
            const response = await checkinService.scanCheckin(
                targetToken,
                selectedEventId,
                selectedDayId || null,
                requestId,
                goodiesProvided
            );

            const checkInData = response?.data || response;
            setCheckInResult(checkInData);
            setMachineState(SCAN_STATES.SUCCESS);
            fetchEventStats();
            toast.success(`Check-In Approved: ${checkInData.attendeeName || 'Attendee'}`);
        } catch (err) {
            setMachineState(SCAN_STATES.ERROR);
            const code = err.errorCode || err.response?.data?.errorCode || 'CHECKIN_REJECTED';
            const msg =
                err.message || err.response?.data?.message || 'Check-in could not be completed.';
            setErrorCode(code);
            setErrorMessage(msg);
            toast.error(msg);
        }
    };

    // Request Android Camera Permission
    const requestCameraPermission = async () => {
        if (Platform.OS === 'android') {
            try {
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.CAMERA,
                    {
                        title: 'Camera Access Needed',
                        message: 'Gate Check-In requires camera permission to scan attendee pass QR codes.',
                        buttonPositive: 'Allow',
                        buttonNegative: 'Deny',
                    }
                );
                return granted === PermissionsAndroid.RESULTS.GRANTED;
            } catch (err) {
                console.warn('Camera permission request error:', err);
                return false;
            }
        }
        return true;
    };

    // Start Camera Scanner
    const startScanner = async () => {
        setCameraError(null);
        setErrorMessage(null);
        setErrorCode(null);

        const hasPermission = await requestCameraPermission();
        if (!hasPermission) {
            setCameraError('Camera permission denied. Please allow camera access in App Settings to scan passes.');
            setIsScanning(false);
            return;
        }

        // Reset synchronous guards
        isLockedRef.current = false;
        setMachineState(SCAN_STATES.IDLE);
        setVerificationResult(null);
        setCheckInResult(null);

        setIsScanning(true);
    };

    // Reset scanner to scan next pass
    const handleResetScanner = () => {
        isLockedRef.current = false;
        lastScannedPayloadRef.current = null;
        setVerificationResult(null);
        setCheckInResult(null);
        setErrorMessage(null);
        setErrorCode(null);
        setManualInput('');
        setGoodiesProvided(false);
        setMachineState(SCAN_STATES.IDLE);
        startScanner();
    };

    // Manual code submission
    const handleManualSubmit = () => {
        if (!manualInput.trim()) {
            toast.error('Please enter a pass identifier or token');
            return;
        }
        stopScanner();
        isLockedRef.current = true;
        setMachineState(SCAN_STATES.PROCESSING);
        lastScannedPayloadRef.current = parseQrPayload(manualInput.trim());
        processPassVerification(manualInput.trim());
    };

    // Simulated code scan from viewport tap
    const handleSimulatedScan = (sampleCode = 'PASS-9823-TECH2026') => {
        if (isLockedRef.current || scanStateRef.current !== SCAN_STATES.IDLE) return;
        isLockedRef.current = true;
        setMachineState(SCAN_STATES.PROCESSING);
        lastScannedPayloadRef.current = parseQrPayload(sampleCode);
        stopScanner();
        processPassVerification(sampleCode);
    };

    const selectedEvent = events.find((e) => e.id === selectedEventId);
    const selectedDay = eventDays.find((d) => d.id === selectedDayId);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#080b12" />

            {/* Floating In-App Toast */}
            {toastMessage && (
                <Animated.View
                    style={[
                        styles.toastBanner,
                        toastMessage.type === 'success' && styles.toastSuccess,
                        toastMessage.type === 'error' && styles.toastError,
                        toastMessage.type === 'warning' && styles.toastWarning,
                        { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] },
                    ]}
                >
                    <Text style={styles.toastText}>{toastMessage.text}</Text>
                </Animated.View>
            )}

            <KeyboardAvoidingView
                style={{flex: 1}}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
            {/* Scrollable Main Area */}
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {/* Top Navbar */}
                <View style={styles.navbar}>
                    {/* <TouchableOpacity
                        onPress={() => {
                            stopScanner();
                            if (navigation && navigation.goBack) {
                                navigation.goBack();
                            } else if (navigation && navigation.navigate) {
                                navigation.navigate('Admin');
                            }
                        }}
                        activeOpacity={0.8}
                        style={styles.backButton}
                    >
                        <ArrowLeft size={16} color="#d1d5db" />
                        <Text style={styles.backButtonText}>Dashboard</Text>
                    </TouchableOpacity> */}

                    <View style={styles.navbarCenter}>
                        <View style={styles.titleRow}>
                            <QrCode size={22} color="#c084fc" />
                            <Text style={styles.navbarTitle}> Gate Check-In</Text>
                        </View>
                        <Text style={styles.navbarSubtitle}>Pass Verification & Entry Scanner</Text>
                    </View>

                    <View style={styles.navbarRight}>
                        {onLogout && (
                            <TouchableOpacity
                                onPress={() => {
                                    stopScanner();
                                    onLogout();
                                }}
                                activeOpacity={0.7}
                                style={styles.logoutButton}
                            >
                                <Text style={styles.logoutButtonText}>Logout</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Controls: Event & Day Selection Card */}
                <View style={styles.card}>
                    {/* Select Event */}
                    <View>
                        <View style={styles.labelRow}>
                            <Text style={styles.fieldLabel}>Select Event</Text>
                            {events.length > 5 && (
                                <Text style={styles.fieldCount}>
                                    {filteredEvents.length} of {events.length} events
                                </Text>
                            )}
                        </View>

                        {events.length > 5 && (
                            <View style={styles.searchWrapper}>
                                <Search size={14} color="#9ca3af" style={styles.searchIcon} />
                                <TextInput
                                    placeholder="Filter events by name or code..."
                                    placeholderTextColor="#6b7280"
                                    value={eventSearch}
                                    onChangeText={setEventSearch}
                                    style={styles.searchInput}
                                />
                            </View>
                        )}

                        {/* Event Dropdown Trigger */}
                        <TouchableOpacity
                            onPress={() => setIsEventPickerVisible(true)}
                            disabled={scanState === SCAN_STATES.PROCESSING || scanState === SCAN_STATES.CHECKING_IN}
                            activeOpacity={0.7}
                            style={[
                                styles.selectTrigger,
                                (scanState === SCAN_STATES.PROCESSING || scanState === SCAN_STATES.CHECKING_IN) && styles.disabledField,
                            ]}
                        >
                            <Text style={styles.selectTriggerText} numberOfLines={1}>
                                {selectedEvent ? `${selectedEvent.name} (${selectedEvent.eventCode})` : 'Choose an Event...'}
                            </Text>
                            <Text style={styles.selectChevron}>▾</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Event Day Selector for Multi-day Check-in */}
                    {eventDays.length > 0 && (
                        <View style={{ marginTop: 12 }}>
                            <View style={styles.labelRow}>
                                <Text style={styles.fieldLabel}>Active Check-In Day</Text>
                                {selectedEvent?.timezone && (
                                    <Text style={styles.fieldTimezone}>TZ: {selectedEvent.timezone}</Text>
                                )}
                            </View>

                            {/* Day Dropdown Trigger */}
                            <TouchableOpacity
                                onPress={() => setIsDayPickerVisible(true)}
                                disabled={scanState === SCAN_STATES.PROCESSING || scanState === SCAN_STATES.CHECKING_IN}
                                activeOpacity={0.7}
                                style={[
                                    styles.selectTrigger,
                                    (scanState === SCAN_STATES.PROCESSING || scanState === SCAN_STATES.CHECKING_IN) && styles.disabledField,
                                ]}
                            >
                                <Text style={styles.selectTriggerText} numberOfLines={1}>
                                    {selectedDay
                                        ? `Day ${selectedDay.dayNumber}: ${selectedDay.label} (${selectedDay.eventDate})`
                                        : 'Choose Check-In Day...'}
                                </Text>
                                <Text style={styles.selectChevron}>▾</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Event Check-In & Goodies Live Statistics */}
                    {eventStats && (
                        <View style={styles.statsContainer}>
                            <View style={styles.statBox}>
                                <Text style={styles.statLabel}>Checked In</Text>
                                <Text style={styles.statValue}>{eventStats.totalCheckedIn}</Text>
                            </View>
                            <View style={[styles.statBox, styles.statBoxEmerald]}>
                                <Text style={[styles.statLabel, { color: '#34d399' }]}>Goodies Provided</Text>
                                <Text style={[styles.statValue, { color: '#6ee7b7' }]}>{eventStats.goodiesProvided}</Text>
                            </View>
                            <View style={styles.statBox}>
                                <Text style={styles.statLabel}>No Goodies</Text>
                                <Text style={[styles.statValue, { color: '#d1d5db' }]}>{eventStats.goodiesNotProvided}</Text>
                            </View>
                        </View>
                    )}
                </View>

                {/* CAMERA SCANNER VIEWPORT (When IDLE or starting scanner) */}
                {scanState === SCAN_STATES.IDLE && (
                    <View style={styles.card}>
                        <View style={styles.scannerViewport}>
                            {/* Scanning Active Screen */}
                            {isScanning ? (
                                <View style={styles.scannerActiveArea}>
                                    {RNCamera ? (
                                        <RNCamera
                                            style={StyleSheet.absoluteFill}
                                            cameraType={CameraType.Back}
                                            scanBarcode={true}
                                            showFrame={false}
                                            laserColor="transparent"
                                            frameColor="transparent"
                                            onReadCode={(event) => {
                                                if (isLockedRef.current || scanStateRef.current !== SCAN_STATES.IDLE) return;
                                                const code = event?.nativeEvent?.codeStringValue;
                                                if (!code) return;

                                                isLockedRef.current = true;
                                                setMachineState(SCAN_STATES.PROCESSING);
                                                lastScannedPayloadRef.current = parseQrPayload(code);
                                                stopScanner();
                                                processPassVerification(code);
                                            }}
                                        />
                                    ) : null}

                                    {/* Pulsing Target Frame */}
                                    <Animated.View
                                        pointerEvents="none"
                                        style={[
                                            styles.reticleBox,
                                            {
                                                transform: [{ scale: pulseAnim }],
                                            },
                                        ]}
                                    />

                                    {/* Animated Laser Scan Bar */}
                                    <Animated.View
                                        pointerEvents="none"
                                        style={[
                                            styles.laserLine,
                                            {
                                                transform: [
                                                    {
                                                        translateY: scanLineAnim.interpolate({
                                                            inputRange: [0, 1],
                                                            outputRange: [-100, 100],
                                                        }),
                                                    },
                                                ],
                                            },
                                        ]}
                                    />

                                    {/* Alignment Tag */}
                                    <View pointerEvents="none" style={styles.reticleBadge}>
                                        <Text style={styles.reticleBadgeText}>ALIGN PASS QR CODE</Text>
                                    </View>
                                </View>
                            ) : (
                                /* Camera Inactive Placeholder */
                                <View style={styles.cameraInactiveArea}>
                                    <Camera size={44} color="#6b7280" />
                                    <Text style={styles.cameraInactiveText}>Camera scanner is inactive.</Text>
                                    <TouchableOpacity
                                        onPress={startScanner}
                                        activeOpacity={0.8}
                                        style={styles.startScannerButton}
                                    >
                                        <Camera size={16} color="#ffffff" />
                                        <Text style={styles.startScannerButtonText}>Start Camera Scanner</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>

                        {/* Camera error notification */}
                        {cameraError && (
                            <View style={styles.cameraErrorBanner}>
                                <AlertTriangle size={16} color="#f87171" />
                                <Text style={styles.cameraErrorText}>{cameraError}</Text>
                            </View>
                        )}

                        {/* Camera Toggle Button */}
                        {isScanning && (
                            <View style={styles.centerAlign}>
                                <TouchableOpacity
                                    onPress={stopScanner}
                                    activeOpacity={0.8}
                                    style={styles.pauseScannerButton}
                                >
                                    <CameraOff size={14} color="#d1d5db" />
                                    <Text style={styles.pauseScannerText}>Pause Scanner</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* Manual Entry Fallback */}
                        <View style={styles.manualEntryContainer}>
                            <Text style={styles.manualEntryHint}>Or enter pass identifier manually:</Text>
                            <View style={styles.manualEntryForm}>
                                <TextInput
                                    placeholder="e.g. TEST123-SZ83KSCE-0001"
                                    placeholderTextColor="#6b7280"
                                    value={manualInput}
                                    onChangeText={setManualInput}
                                    style={styles.manualInput}
                                    autoCapitalize="characters"
                                />
                                <TouchableOpacity
                                    onPress={handleManualSubmit}
                                    activeOpacity={0.8}
                                    style={styles.manualVerifyButton}
                                >
                                    <Search size={14} color="#ffffff" />
                                    <Text style={styles.manualVerifyText}>Verify</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                )}

                {/* PROCESSING SPINNER */}
                {scanState === SCAN_STATES.PROCESSING && (
                    <View style={[styles.card, styles.spinnerCard]}>
                        <ActivityIndicator size="large" color="#c084fc" style={{ marginBottom: 16 }} />
                        <Text style={styles.spinnerTextTitle}>Verifying Pass...</Text>
                        <Text style={styles.spinnerTextSub}>
                            Querying pass status, attendee registration, and day validity with the server.
                        </Text>
                    </View>
                )}

                {/* CHECKING-IN SPINNER */}
                {scanState === SCAN_STATES.CHECKING_IN && (
                    <View style={[styles.card, styles.spinnerCard]}>
                        <ActivityIndicator size="large" color="#34d399" style={{ marginBottom: 16 }} />
                        <Text style={styles.spinnerTextTitle}>Recording Check-In...</Text>
                        <Text style={styles.spinnerTextSub}>Persisting admission entry in the database.</Text>
                    </View>
                )}

                {/* RESULT DISPLAYED: Pass Details Card */}
                {scanState === SCAN_STATES.RESULT_DISPLAYED && verificationResult && (
                    <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
                        {/* Header Status Banner */}
                        <View
                            style={[
                                styles.resultHeaderBanner,
                                verificationResult.eligibleForCheckIn
                                    ? styles.bgEmerald
                                    : verificationResult.status === 'NOT_ACTIVATED'
                                        ? styles.bgAmber
                                        : verificationResult.status === 'ALREADY_CHECKED_IN'
                                            ? styles.bgOrange
                                            : styles.bgRose,
                            ]}
                        >
                            {verificationResult.eligibleForCheckIn ? (
                                <>
                                    <ShieldCheck size={18} color="#ffffff" />
                                    <Text style={styles.resultBannerText}> PASS VERIFIED · READY FOR CHECK-IN</Text>
                                </>
                            ) : verificationResult.status === 'NOT_ACTIVATED' ? (
                                <>
                                    <AlertTriangle size={18} color="#ffffff" />
                                    <Text style={styles.resultBannerText}> PASS NOT ACTIVATED</Text>
                                </>
                            ) : verificationResult.status === 'ALREADY_CHECKED_IN' ? (
                                <>
                                    <Clock size={18} color="#ffffff" />
                                    <Text style={styles.resultBannerText}> ALREADY CHECKED IN</Text>
                                </>
                            ) : (
                                <>
                                    <XCircle size={18} color="#ffffff" />
                                    <Text style={styles.resultBannerText}>
                                        {' '}
                                        ENTRY REJECTED ({verificationResult.status})
                                    </Text>
                                </>
                            )}
                        </View>

                        {/* Pass Metadata Body */}
                        <View style={{ padding: 16 }}>
                            {/* Pass Metadata Details */}
                            <View style={styles.metaBox}>
                                <View style={styles.metaRow}>
                                    <Text style={styles.metaLabel}>Pass Number:</Text>
                                    <Text style={styles.metaPassNumber}>{verificationResult.passNumber}</Text>
                                </View>
                                <View style={styles.metaRow}>
                                    <Text style={styles.metaLabel}>Event:</Text>
                                    <Text style={styles.metaValueBold}>{verificationResult.eventName}</Text>
                                </View>
                                <View style={styles.metaRow}>
                                    <Text style={styles.metaLabel}>Day / Session:</Text>
                                    <Text style={styles.metaValue}>
                                        Day {verificationResult.dayNumber}: {verificationResult.eventDayLabel}
                                    </Text>
                                </View>
                            </View>

                            {/* Attendee Info Card */}
                            {verificationResult.attendeeName ? (
                                <View style={styles.attendeeBox}>
                                    <View style={styles.rowAlign}>
                                        <User size={16} color="#c084fc" />
                                        <Text style={styles.attendeeNameText}>
                                            {' '}
                                            {verificationResult.attendeeName}
                                        </Text>
                                    </View>
                                    {verificationResult.attendeeEmail ? (
                                        <Text style={styles.attendeeEmailText}>
                                            {verificationResult.attendeeEmail}
                                        </Text>
                                    ) : null}
                                    {verificationResult.attendeeOrganization ? (
                                        <View style={[styles.rowAlign, { marginTop: 4, paddingLeft: 20 }]}>
                                            <Building size={12} color="#9ca3af" />
                                            <Text style={styles.attendeeOrgText}>
                                                {' '}
                                                {verificationResult.attendeeOrganization}
                                            </Text>
                                        </View>
                                    ) : null}
                                </View>
                            ) : (
                                <View style={styles.activationWarningBox}>
                                    <AlertTriangle size={16} color="#f59e0b" style={{ marginTop: 2 }} />
                                    <View style={{ flex: 1, marginLeft: 8 }}>
                                        <Text style={styles.activationWarningTitle}>Attendee Registration Required</Text>
                                        <Text style={styles.activationWarningSub}>
                                            This pass has not been activated yet. The attendee must scan the pass or visit
                                            the activation portal before entry can be permitted.
                                        </Text>
                                    </View>
                                </View>
                            )}

                            {/* Already Checked-In Status Details */}
                            {verificationResult.status === 'ALREADY_CHECKED_IN' && (
                                <View style={styles.alreadyCheckedBox}>
                                    <View style={styles.metaRow}>
                                        <Text style={styles.metaLabel}>Check-In Status:</Text>
                                        <Text style={{ color: '#34d399', fontWeight: '700', fontSize: 12 }}>Checked In</Text>
                                    </View>
                                    <View style={styles.metaRow}>
                                        <Text style={styles.metaLabel}>Goodies Status:</Text>
                                        <View
                                            style={[
                                                styles.badgePill,
                                                verificationResult.goodiesProvided
                                                    ? styles.badgeEmerald
                                                    : styles.badgeDark,
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.badgePillText,
                                                    verificationResult.goodiesProvided
                                                        ? { color: '#6ee7b7' }
                                                        : { color: '#9ca3af' },
                                                ]}
                                            >
                                                {verificationResult.goodiesProvided ? 'Provided' : 'Not Provided'}
                                            </Text>
                                        </View>
                                    </View>
                                    {verificationResult.goodiesProvided && verificationResult.goodiesProvidedByName && (
                                        <View style={styles.metaRow}>
                                            <Text style={styles.metaLabel}>Goodies Handled By:</Text>
                                            <Text style={styles.metaValue}>{verificationResult.goodiesProvidedByName}</Text>
                                        </View>
                                    )}
                                    {verificationResult.checkedInAt && (
                                        <View style={styles.metaRow}>
                                            <Text style={styles.metaLabel}>Admission Time:</Text>
                                            <Text style={[styles.metaValue, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}>
                                                {new Date(verificationResult.checkedInAt).toLocaleTimeString([], {
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            )}

                            {/* Status Message */}
                            <Text style={styles.statusMessageNotice}>
                                {verificationResult.message}
                            </Text>

                            {/* Goodies Provided Toggle (Only for eligible passes) */}
                            {verificationResult.eligibleForCheckIn && (
                                <View style={styles.goodiesToggleBox}>
                                    <View style={{ flex: 1, paddingRight: 8 }}>
                                        <View style={styles.rowAlign}>
                                            <Gift size={16} color="#c084fc" />
                                            <Text style={styles.goodiesToggleTitle}> Goodies Provided </Text>
                                            <View
                                                style={[
                                                    styles.badgePill,
                                                    goodiesProvided ? styles.badgeEmerald : styles.badgeDark,
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.badgePillText,
                                                        goodiesProvided ? { color: '#6ee7b7' } : { color: '#9ca3af' },
                                                    ]}
                                                >
                                                    {goodiesProvided ? 'Provided' : 'Not Provided'}
                                                </Text>
                                            </View>
                                        </View>
                                        <Text style={styles.goodiesToggleSub}>
                                            Record event kit / goodies distribution to this attendee
                                        </Text>
                                    </View>

                                    <Switch
                                        value={goodiesProvided}
                                        onValueChange={setGoodiesProvided}
                                        thumbColor="#ffffff"
                                        trackColor={{ false: '#1c2438', true: '#059669' }}
                                    />
                                </View>
                            )}

                            {/* Actions */}
                            <View style={{ marginTop: 16 }}>
                                {verificationResult.eligibleForCheckIn ? (
                                    <TouchableOpacity
                                        onPress={() => executeCheckIn(verificationResult.passNumber, verificationResult)}
                                        activeOpacity={0.8}
                                        style={styles.confirmCheckinButton}
                                    >
                                        <Check size={18} color="#ffffff" />
                                        <Text style={styles.confirmCheckinButtonText}> Confirm Check-In</Text>
                                    </TouchableOpacity>
                                ) : null}

                                <TouchableOpacity
                                    onPress={handleResetScanner}
                                    activeOpacity={0.8}
                                    style={styles.scanNextPassButton}
                                >
                                    <RefreshCw size={14} color="#e5e7eb" />
                                    <Text style={styles.scanNextPassButtonText}> Scan Next Pass</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                )}

                {/* SUCCESS STATE */}
                {scanState === SCAN_STATES.SUCCESS && checkInResult && (
                    <View style={[styles.card, styles.successCard]}>
                        <View style={styles.successIconCircle}>
                            <CheckCircle size={38} color="#34d399" />
                        </View>

                        <View style={styles.centerAlign}>
                            <Text style={styles.successTitle}>Check-In Approved!</Text>
                            <Text style={styles.successSubtitle}>Admission Entry Recorded</Text>
                        </View>

                        <View style={styles.successDetailsBox}>
                            <View style={styles.metaRow}>
                                <Text style={styles.metaLabel}>Attendee:</Text>
                                <Text style={styles.metaValueBold}>{checkInResult.attendeeName}</Text>
                            </View>
                            <View style={styles.metaRow}>
                                <Text style={styles.metaLabel}>Pass Number:</Text>
                                <Text style={styles.metaPassNumber}>{checkInResult.passNumber}</Text>
                            </View>
                            <View style={styles.metaRow}>
                                <Text style={styles.metaLabel}>Event Session:</Text>
                                <Text style={styles.metaValue}>
                                    Day {checkInResult.dayNumber}: {checkInResult.eventDayLabel}
                                </Text>
                            </View>
                            <View style={styles.metaRow}>
                                <Text style={styles.metaLabel}>Check-In Status:</Text>
                                <View style={styles.rowAlign}>
                                    <Check size={14} color="#34d399" />
                                    <Text style={{ color: '#34d399', fontWeight: '700', fontSize: 12 }}> Checked In</Text>
                                </View>
                            </View>
                            <View style={styles.metaRow}>
                                <Text style={styles.metaLabel}>Goodies Status:</Text>
                                <View
                                    style={[
                                        styles.badgePill,
                                        checkInResult.goodiesProvided ? styles.badgeEmerald : styles.badgeDark,
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.badgePillText,
                                            checkInResult.goodiesProvided ? { color: '#6ee7b7' } : { color: '#9ca3af' },
                                        ]}
                                    >
                                        {checkInResult.goodiesProvided ? 'Provided' : 'Not Provided'}
                                    </Text>
                                </View>
                            </View>
                            {checkInResult.goodiesProvided && (
                                <View style={styles.metaRow}>
                                    <Text style={styles.metaLabel}>Goodies Handled By:</Text>
                                    <Text style={styles.metaValue}>
                                        {checkInResult.goodiesProvidedByName || checkInResult.checkedInByName || 'Gatekeeper'}
                                    </Text>
                                </View>
                            )}
                            <View style={styles.metaRow}>
                                <Text style={styles.metaLabel}>Checked In By:</Text>
                                <Text style={styles.metaValue}>{checkInResult.checkedInByName || 'Gatekeeper'}</Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            onPress={handleResetScanner}
                            activeOpacity={0.8}
                            style={styles.purpleNextButton}
                        >
                            <RefreshCw size={16} color="#ffffff" />
                            <Text style={styles.purpleNextButtonText}> Scan Next Pass</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* ERROR STATE */}
                {scanState === SCAN_STATES.ERROR && errorDisplay && (
                    <View style={styles.card}>
                        {/* Status Icon Circle */}
                        <View
                            style={[
                                styles.errorIconCircle,
                                errorDisplay.severity === 'danger'
                                    ? styles.circleDanger
                                    : errorDisplay.severity === 'warning'
                                        ? styles.circleWarning
                                        : styles.circleInfo,
                            ]}
                        >
                            {errorDisplay.severity === 'danger' ? (
                                <XCircle size={34} color="#f43f5e" />
                            ) : errorDisplay.severity === 'warning' ? (
                                <AlertTriangle size={34} color="#f59e0b" />
                            ) : (
                                <HelpCircle size={34} color="#c084fc" />
                            )}
                        </View>

                        {/* Title & Code Badge */}
                        <View style={styles.centerAlign}>
                            <Text style={styles.errorTitle}>{errorDisplay.title}</Text>
                            <View style={styles.errorCodeBadge}>
                                <Text style={styles.errorCodeBadgeText}>[{errorDisplay.code}]</Text>
                            </View>
                        </View>

                        {/* Explanation Card */}
                        <View
                            style={[
                                styles.errorExplanationCard,
                                errorDisplay.severity === 'danger'
                                    ? styles.boxDanger
                                    : errorDisplay.severity === 'warning'
                                        ? styles.boxWarning
                                        : styles.boxInfo,
                            ]}
                        >
                            <Text style={styles.errorExplanationText}>{errorDisplay.explanation}</Text>
                        </View>

                        {/* Action Guidance Card */}
                        <View style={styles.actionGuidanceCard}>
                            <View style={styles.rowAlign}>
                                <Lightbulb size={16} color="#34d399" />
                                <Text style={styles.actionGuidanceTitle}> Recommended Action</Text>
                            </View>
                            <Text style={styles.actionGuidanceText}>{errorDisplay.action}</Text>
                        </View>

                        {/* Contextual Action Shortcut */}
                        {errorDisplay.code === 'PASS_NOT_ACTIVATED' && (
                            <TouchableOpacity
                                onPress={() => Linking.openURL('https://events.renaissance.ac.in/activate')}
                                activeOpacity={0.8}
                                style={styles.activationPortalButton}
                            >
                                <Text style={styles.activationPortalText}>Open Pass Activation Portal </Text>
                                <ExternalLink size={14} color="#fde68a" />
                            </TouchableOpacity>
                        )}

                        {/* Reset / Retry Button */}
                        <View style={{ marginTop: 12 }}>
                            <TouchableOpacity
                                onPress={handleResetScanner}
                                activeOpacity={0.8}
                                style={styles.purpleNextButton}
                            >
                                <RefreshCw size={14} color="#ffffff" />
                                <Text style={styles.purpleNextButtonText}> Try Again / Scan Next Pass</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={handleResetScanner}
                                activeOpacity={0.8}
                                style={styles.manualEntrySecondaryButton}
                            >
                                <Text style={styles.manualEntrySecondaryText}>Manual Entry</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </ScrollView>
            </KeyboardAvoidingView>

            {/* EVENT SELECTOR MODAL */}
            <Modal
                visible={isEventPickerVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setIsEventPickerVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select Event</Text>
                            <TouchableOpacity
                                onPress={() => setIsEventPickerVisible(false)}
                                style={styles.modalCloseButton}
                            >
                                <Text style={styles.modalCloseText}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Search within Modal */}
                        <View style={[styles.searchWrapper, { marginHorizontal: 16, marginBottom: 12 }]}>
                            <Search size={14} color="#9ca3af" style={styles.searchIcon} />
                            <TextInput
                                placeholder="Search event name or code..."
                                placeholderTextColor="#6b7280"
                                value={eventSearch}
                                onChangeText={setEventSearch}
                                style={styles.searchInput}
                            />
                        </View>

                        <ScrollView
                            style={styles.modalList}
                            contentContainerStyle={styles.modalListContent}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                        >
                            {filteredEvents.map((ev) => {
                                const isSelected = ev.id === selectedEventId;
                                return (
                                    <TouchableOpacity
                                        key={ev.id}
                                        onPress={() => {
                                            setSelectedEventId(ev.id);
                                            setIsEventPickerVisible(false);
                                            if (scanState !== SCAN_STATES.IDLE) {
                                                handleResetScanner();
                                            }
                                        }}
                                        style={[styles.modalItem, isSelected && styles.modalItemSelected]}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.modalItemTitle, isSelected && { color: '#c084fc' }]}>
                                                {ev.name}
                                            </Text>
                                            <Text style={styles.modalItemSub}>Code: {ev.eventCode}</Text>
                                        </View>
                                        {isSelected && <Text style={{ color: '#c084fc', fontWeight: 'bold' }}>✓</Text>}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* DAY SELECTOR MODAL */}
            <Modal
                visible={isDayPickerVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setIsDayPickerVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Active Check-In Day</Text>
                            <TouchableOpacity
                                onPress={() => setIsDayPickerVisible(false)}
                                style={styles.modalCloseButton}
                            >
                                <Text style={styles.modalCloseText}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            style={styles.modalList}
                            contentContainerStyle={styles.modalListContent}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                        >
                            {eventDays.map((d) => {
                                const isSelected = d.id === selectedDayId;
                                return (
                                    <TouchableOpacity
                                        key={d.id}
                                        onPress={() => {
                                            setSelectedDayId(d.id);
                                            setIsDayPickerVisible(false);
                                        }}
                                        style={[styles.modalItem, isSelected && styles.modalItemSelected]}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.modalItemTitle, isSelected && { color: '#c084fc' }]}>
                                                Day {d.dayNumber}: {d.label}
                                            </Text>
                                            <Text style={styles.modalItemSub}>Date: {d.eventDate}</Text>
                                        </View>
                                        {isSelected && <Text style={{ color: '#c084fc', fontWeight: 'bold' }}>✓</Text>}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

// ==========================================
// STYLES (Identical Theme & Clean Mobile Polish)
// ==========================================
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#080b12',
    },
    scrollContent: {
        paddingHorizontal: 18,
        paddingTop: Platform.OS === 'android' ? 30 : 44,
        paddingBottom: 40,
        alignItems: 'center',
    },
    // Toast
    toastBanner: {
        position: 'absolute',
        top: Platform.OS === 'android' ? 36 : 54,
        left: 20,
        right: 20,
        zIndex: 9999,
        backgroundColor: '#181f32',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#2b364e',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        alignItems: 'center',
    },
    toastSuccess: {
        backgroundColor: '#064e3b',
        borderColor: '#059669',
    },
    toastError: {
        backgroundColor: '#881337',
        borderColor: '#e11d48',
    },
    toastWarning: {
        backgroundColor: '#78350f',
        borderColor: '#d97706',
    },
    toastText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center',
    },
    // Navbar
    navbar: {
        width: '100%',
        maxWidth: 480,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#131620',
        borderColor: '#202738',
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 8,
    },
    backButtonText: {
        color: '#d1d5db',
        fontSize: 12,
        marginLeft: 6,
        fontWeight: '500',
    },
    navbarCenter: {
        alignItems: 'center',
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    navbarTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#ffffff',
    },
    navbarSubtitle: {
        fontSize: 11,
        color: '#9ca3af',
        marginTop: 2,
    },
    // Cards
    card: {
        width: '100%',
        maxWidth: 480,
        backgroundColor: '#0c101d',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#181f32',
        marginBottom: 16,
    },
    spinnerCard: {
        alignItems: 'center',
        paddingVertical: 32,
        paddingHorizontal: 20,
    },
    spinnerTextTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#ffffff',
        marginBottom: 6,
    },
    spinnerTextSub: {
        fontSize: 12,
        color: '#9ca3af',
        textAlign: 'center',
        maxWidth: 280,
        lineHeight: 18,
    },
    // Form Labels & Selectors
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    fieldLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#d1d5db',
    },
    fieldCount: {
        fontSize: 10,
        color: '#9ca3af',
    },
    fieldTimezone: {
        fontSize: 10,
        color: '#9ca3af',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    searchWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#080b15',
        borderWidth: 1,
        borderColor: '#1c2438',
        borderRadius: 8,
        paddingHorizontal: 10,
        marginBottom: 8,
        height: 36,
    },
    searchIcon: {
        marginRight: 6,
    },
    searchInput: {
        flex: 1,
        fontSize: 12,
        color: '#ffffff',
        paddingVertical: 0,
    },
    selectTrigger: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#080b15',
        borderWidth: 1,
        borderColor: '#1c2438',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    selectTriggerText: {
        fontSize: 13,
        color: '#ffffff',
        flex: 1,
        marginRight: 8,
    },
    selectChevron: {
        color: '#9ca3af',
        fontSize: 14,
    },
    disabledField: {
        opacity: 0.5,
    },
    // Stats
    statsContainer: {
        flexDirection: 'row',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#181f32',
        justifyContent: 'space-between',
    },
    statBox: {
        flex: 1,
        backgroundColor: '#080b15',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#1c2438',
        padding: 8,
        alignItems: 'center',
        marginHorizontal: 3,
    },
    statBoxEmerald: {
        borderColor: 'rgba(16, 185, 129, 0.35)',
    },
    statLabel: {
        fontSize: 10,
        color: '#9ca3af',
        fontWeight: '500',
        marginBottom: 2,
        textAlign: 'center',
    },
    statValue: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#ffffff',
    },
    // Scanner Viewport
    scannerViewport: {
        width: '100%',
        aspectRatio: 1,
        maxWidth: 340,
        alignSelf: 'center',
        backgroundColor: '#04060a',
        borderRadius: 14,
        borderWidth: 2,
        borderColor: 'rgba(168, 85, 247, 0.45)',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    scannerActiveArea: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    reticleBox: {
        width: 200,
        height: 200,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: '#c084fc',
        borderStyle: 'dashed',
    },
    laserLine: {
        position: 'absolute',
        width: 190,
        height: 2,
        backgroundColor: '#a855f7',
        shadowColor: '#a855f7',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 8,
        elevation: 4,
    },
    reticleBadge: {
        position: 'absolute',
        top: 14,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 99,
    },
    reticleBadgeText: {
        color: '#d8b4fe',
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    tapToScanHint: {
        position: 'absolute',
        bottom: 14,
        color: 'rgba(216, 180, 254, 0.6)',
        fontSize: 10,
    },
    cameraInactiveArea: {
        alignItems: 'center',
        padding: 24,
    },
    cameraInactiveText: {
        color: '#9ca3af',
        fontSize: 13,
        marginTop: 10,
        marginBottom: 14,
    },
    startScannerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#9333ea',
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 12,
        shadowColor: '#9333ea',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 3,
    },
    startScannerButtonText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: 'bold',
        marginLeft: 8,
    },
    cameraErrorBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.35)',
        borderRadius: 10,
        padding: 10,
        marginTop: 12,
    },
    cameraErrorText: {
        color: '#fecaca',
        fontSize: 11,
        marginLeft: 8,
        flex: 1,
    },
    pauseScannerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1c2638',
        borderColor: '#232f46',
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 8,
        marginTop: 12,
    },
    pauseScannerText: {
        color: '#d1d5db',
        fontSize: 11,
        marginLeft: 6,
        fontWeight: '500',
    },
    manualEntryContainer: {
        marginTop: 14,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#181f32',
    },
    manualEntryHint: {
        fontSize: 11,
        color: '#9ca3af',
        marginBottom: 8,
    },
    manualEntryForm: {
        flexDirection: 'row',
    },
    manualInput: {
        flex: 1,
        backgroundColor: '#080b15',
        color: '#ffffff',
        fontSize: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: '#1c2438',
        borderRadius: 8,
        marginRight: 8,
    },
    manualVerifyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1c2638',
        paddingHorizontal: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#232f46',
    },
    manualVerifyText: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: '600',
        marginLeft: 4,
    },
    // Results Display Banner
    resultHeaderBanner: {
        paddingVertical: 14,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    bgEmerald: {
        backgroundColor: '#059669',
    },
    bgAmber: {
        backgroundColor: '#d97706',
    },
    bgOrange: {
        backgroundColor: '#ea580c',
    },
    bgRose: {
        backgroundColor: '#e11d48',
    },
    resultBannerText: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 13,
    },
    metaBox: {
        backgroundColor: '#080b15',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: '#1c2438',
        marginBottom: 12,
    },
    metaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginVertical: 3,
    },
    metaLabel: {
        color: '#9ca3af',
        fontSize: 12,
    },
    metaPassNumber: {
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        fontWeight: 'bold',
        color: '#d8b4fe',
        fontSize: 13,
    },
    metaValueBold: {
        fontWeight: '600',
        color: '#ffffff',
        fontSize: 12,
    },
    metaValue: {
        color: '#e5e7eb',
        fontSize: 12,
    },
    attendeeBox: {
        backgroundColor: '#080b15',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: '#1c2438',
        marginBottom: 12,
    },
    attendeeNameText: {
        fontWeight: 'bold',
        fontSize: 15,
        color: '#ffffff',
    },
    attendeeEmailText: {
        fontSize: 12,
        color: '#d1d5db',
        paddingLeft: 22,
        marginTop: 2,
    },
    attendeeOrgText: {
        fontSize: 11,
        color: '#9ca3af',
    },
    activationWarningBox: {
        flexDirection: 'row',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.3)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
    },
    activationWarningTitle: {
        color: '#fcd34d',
        fontWeight: 'bold',
        fontSize: 12,
        marginBottom: 2,
    },
    activationWarningSub: {
        color: '#fef3c7',
        fontSize: 11,
        lineHeight: 16,
    },
    alreadyCheckedBox: {
        backgroundColor: '#080b15',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: '#1c2438',
        marginBottom: 12,
    },
    statusMessageNotice: {
        fontSize: 11,
        color: '#d1d5db',
        textAlign: 'center',
        marginVertical: 10,
        paddingHorizontal: 8,
    },
    goodiesToggleBox: {
        backgroundColor: '#080b15',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: '#1c2438',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    goodiesToggleTitle: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#ffffff',
    },
    goodiesToggleSub: {
        fontSize: 10,
        color: '#9ca3af',
        marginTop: 2,
        paddingLeft: 22,
    },
    badgePill: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        borderWidth: 1,
    },
    badgeEmerald: {
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        borderColor: 'rgba(16, 185, 129, 0.35)',
    },
    badgeDark: {
        backgroundColor: '#1f2937',
        borderColor: '#374151',
    },
    badgePillText: {
        fontSize: 10,
        fontWeight: 'bold',
    },
    confirmCheckinButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#059669',
        paddingVertical: 13,
        borderRadius: 12,
        marginBottom: 8,
    },
    confirmCheckinButtonText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: 'bold',
    },
    scanNextPassButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1c2638',
        borderWidth: 1,
        borderColor: '#232f46',
        paddingVertical: 11,
        borderRadius: 12,
    },
    scanNextPassButtonText: {
        color: '#e5e7eb',
        fontSize: 12,
        fontWeight: '600',
    },
    // Success Card
    successCard: {
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.5)',
        alignItems: 'center',
    },
    successIconCircle: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'rgba(16, 185, 129, 0.18)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    successTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#ffffff',
    },
    successSubtitle: {
        fontSize: 12,
        color: '#6ee7b7',
        marginTop: 2,
        marginBottom: 14,
    },
    successDetailsBox: {
        width: '100%',
        backgroundColor: '#080b15',
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: '#1c2438',
        marginBottom: 16,
    },
    purpleNextButton: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#9333ea',
        paddingVertical: 12,
        borderRadius: 12,
    },
    purpleNextButtonText: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 13,
    },
    // Error Card
    errorIconCircle: {
        width: 58,
        height: 58,
        borderRadius: 29,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
        marginBottom: 10,
        borderWidth: 1,
    },
    circleDanger: {
        backgroundColor: 'rgba(244, 63, 94, 0.15)',
        borderColor: 'rgba(244, 63, 94, 0.35)',
    },
    circleWarning: {
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        borderColor: 'rgba(245, 158, 11, 0.35)',
    },
    circleInfo: {
        backgroundColor: 'rgba(192, 132, 252, 0.15)',
        borderColor: 'rgba(192, 132, 252, 0.35)',
    },
    errorTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#ffffff',
        textAlign: 'center',
    },
    errorCodeBadge: {
        backgroundColor: '#080b15',
        borderColor: '#1c2438',
        borderWidth: 1,
        paddingHorizontal: 10,
        paddingVertical: 2,
        borderRadius: 99,
        marginTop: 4,
        marginBottom: 12,
    },
    errorCodeBadgeText: {
        color: '#d8b4fe',
        fontSize: 10,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        fontWeight: '600',
    },
    errorExplanationCard: {
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        marginBottom: 10,
    },
    boxDanger: {
        backgroundColor: 'rgba(244, 63, 94, 0.1)',
        borderColor: 'rgba(244, 63, 94, 0.25)',
    },
    boxWarning: {
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderColor: 'rgba(245, 158, 11, 0.25)',
    },
    boxInfo: {
        backgroundColor: 'rgba(192, 132, 252, 0.1)',
        borderColor: 'rgba(192, 132, 252, 0.25)',
    },
    errorExplanationText: {
        color: '#fecdd3',
        fontSize: 11,
        lineHeight: 16,
    },
    actionGuidanceCard: {
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
        borderColor: 'rgba(16, 185, 129, 0.22)',
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
    },
    actionGuidanceTitle: {
        color: '#34d399',
        fontSize: 11,
        fontWeight: 'bold',
    },
    actionGuidanceText: {
        color: '#d1d5db',
        fontSize: 11,
        lineHeight: 16,
        marginTop: 4,
        paddingLeft: 20,
    },
    activationPortalButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(217, 119, 6, 0.2)',
        borderColor: 'rgba(217, 119, 6, 0.4)',
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 9,
        marginBottom: 6,
    },
    activationPortalText: {
        color: '#fef08a',
        fontSize: 11,
        fontWeight: '600',
    },
    manualEntrySecondaryButton: {
        backgroundColor: '#1c2638',
        borderColor: '#232f46',
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 10,
        alignItems: 'center',
        marginTop: 8,
    },
    manualEntrySecondaryText: {
        color: '#d1d5db',
        fontSize: 12,
    },
    // Modals
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: '#0c101d',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderWidth: 1,
        borderColor: '#181f32',
        maxHeight: '75%',
        paddingBottom: Platform.OS === 'android' ? 36 : 24,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#181f32',
    },
    modalTitle: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    modalCloseButton: {
        padding: 6,
    },
    modalCloseText: {
        color: '#9ca3af',
        fontSize: 16,
        fontWeight: 'bold',
    },
    modalList: {
        paddingHorizontal: 16,
    },
    modalListContent: {
        paddingBottom: 60,
    },
    modalItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#181f32',
    },
    modalItemSelected: {
        backgroundColor: 'rgba(147, 51, 234, 0.1)',
        borderRadius: 8,
        paddingHorizontal: 8,
    },
    modalItemTitle: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '600',
    },
    modalItemSub: {
        color: '#9ca3af',
        fontSize: 11,
        marginTop: 2,
    },
    // Helpers
    rowAlign: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    centerAlign: {
        alignItems: 'center',
    },
    navbarRight: {
        width: 60,
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    logoutButton: {
        backgroundColor: '#1c2438',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#2d3748',
    },
    logoutButtonText: {
        color: '#f87171',
        fontSize: 11,
        fontWeight: '600',
    },
});

export default CheckinScan;
