class VacationDutyManager {
    constructor() {
        this.currentDate = new Date(); // 현재 날짜로 초기화
        this.selectedDates = [];
        this.isSelecting = false;
        this.selectionStart = null;
        this.applications = [];

        // 방학 기간 설정 (하드코딩: 2026.1.9 ~ 2026.2.28)
        this.vacationStart = new Date(2026, 0, 9); // 2026년 1월 9일
        this.vacationEnd = new Date(2026, 1, 28);   // 2026년 2월 28일

        // 공휴일 설정
        this.holidays = [];

        // 날짜별 복무 유형 저장 (기본값: 41조)
        this.dutySchedule = {}; // { "2025-07-01": "41", "2025-07-02": "business", ... }

        // Firebase 초기화 (나중에 설정)
        this.initFirebase();

        // this.loadVacationSettings(); // 방학 기간이 하드코딩되어 불필요
        this.loadApplications();
        this.initializeDutySchedule(); // 방학 기간이 설정되었으므로 복무 일정 초기화
        this.renderCalendar();

        // 드롭존 이벤트 설정
        this.setupDropZones();

        // 이름/부서 변경 시 Firebase 동기화 재설정
        document.getElementById('teacher-name').addEventListener('change', () => {
            this.setupRealtimeSync();
            this.saveToFirebase();
        });

        document.getElementById('teacher-department').addEventListener('change', () => {
            this.setupRealtimeSync();
            this.saveToFirebase();
        });
    }

    initFirebase() {
        try {
            // localStorage에서 설정 불러오기
            const apiKey = localStorage.getItem('firebase_apiKey');
            const projectId = localStorage.getItem('firebase_projectId');

            if (!apiKey || !projectId) {
                console.log('Firebase 설정 필요 - 설정 버튼을 클릭하여 입력하세요');
                this.firebaseEnabled = false;
                this.updateFirebaseStatus(false);
                return;
            }

            const firebaseConfig = {
                apiKey: apiKey,
                authDomain: `${projectId}.firebaseapp.com`,
                databaseURL: `https://${projectId}-default-rtdb.asia-southeast1.firebasedatabase.app`,
                projectId: projectId,
                storageBucket: `${projectId}.firebasestorage.app`,
                messagingSenderId: "383693605457",
                appId: "1:383693605457:web:b5c75a08b0fcef08188670"
            };

            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            this.database = firebase.database();
            this.vacationDutyRef = this.database.ref('vacation-duty');

            // 연결 테스트
            this.database.ref('.info/connected').on('value', (snapshot) => {
                if (snapshot.val() === true) {
                    console.log('✅ Firebase 연결 성공');
                    this.firebaseEnabled = true;
                    this.updateFirebaseStatus(true);
                    this.setupRealtimeSync();
                } else {
                    console.log('❌ Firebase 연결 끊어짐');
                    this.firebaseEnabled = false;
                    this.updateFirebaseStatus(false);
                }
            });

        } catch (error) {
            console.warn('Firebase 초기화 실패:', error);
            this.firebaseEnabled = false;
        }
    }

    showFirebaseSettingsModal() {
        const modal = document.getElementById('firebaseModal');
        modal.style.display = 'flex';

        const apiKey = localStorage.getItem('firebase_apiKey');
        const projectId = localStorage.getItem('firebase_projectId');
        const savedSettingsInfo = document.getElementById('savedSettingsInfo');

        if (apiKey && projectId) {
            document.getElementById('firebaseApiKey').value = apiKey;
            document.getElementById('firebaseProjectId').value = projectId;
            savedSettingsInfo.style.display = 'block';
        } else {
            savedSettingsInfo.style.display = 'none';
        }
    }

    updateFirebaseStatus(connected) {
        const statusElement = document.getElementById('firebase-status');
        if (!statusElement) return;

        if (connected) {
            statusElement.textContent = '🟢 연결됨';
            statusElement.style.background = '#d4edda';
            statusElement.style.color = '#155724';
        } else {
            statusElement.textContent = '🔴 연결 안됨';
            statusElement.style.background = '#f8d7da';
            statusElement.style.color = '#721c24';
        }
    }

    // 실시간 동기화 설정
    setupRealtimeSync() {
        if (!this.firebaseEnabled || !this.vacationDutyRef) return;

        console.log('실시간 동기화 설정 중...');

        // 사용자별 데이터 동기화 (이름_부서를 키로 사용)
        const teacherName = document.getElementById('teacher-name').value.trim();
        const teacherDepartment = document.getElementById('teacher-department').value.trim();

        if (!teacherName || !teacherDepartment) {
            console.log('이름과 부서가 설정되지 않아 동기화를 건너뜁니다.');
            return;
        }

        const userKey = `${teacherName}_${teacherDepartment}`;
        this.userRef = this.vacationDutyRef.child(userKey);

        console.log('사용자 키:', userKey);
    }

    // Firebase에 전체 설정 저장
    saveToFirebase() {
        if (!this.firebaseEnabled || !this.userRef) {
            console.log('Firebase 비활성화됨 - 로컬 저장소만 사용');
            return Promise.resolve();
        }

        const teacherName = document.getElementById('teacher-name').value.trim();
        const teacherDepartment = document.getElementById('teacher-department').value.trim();

        if (!teacherName || !teacherDepartment) {
            console.log('이름과 부서가 없어 Firebase 저장 생략');
            return Promise.resolve();
        }

        const data = {
            name: teacherName,
            department: teacherDepartment,
            vacationStart: this.vacationStart,
            vacationEnd: this.vacationEnd,
            dutySchedule: this.dutySchedule,
            detailSchedule: this.detailSchedule || {},
            holidays: this.holidays,
            lastUpdated: Date.now()
        };

        return this.userRef.set(data)
            .then(() => {
                console.log('✅ Firebase에 저장 완료:', teacherName);
            })
            .catch(error => {
                console.error('❌ Firebase 저장 실패:', error);
            });
    }

    // Firebase에서 신청 삭제
    deleteApplicationFromFirebase(id) {
        if (!this.firebaseEnabled || !this.database) return;

        try {
            const applicationRef = this.database.ref(`applications/${id}`);
            applicationRef.remove();
        } catch (error) {
            console.error('Firebase 삭제 오류:', error);
        }
    }

    // Firebase에 설정 저장
    saveSettingsToFirebase(settings) {
        if (!this.firebaseEnabled || !this.database) return;

        try {
            const settingsRef = this.database.ref('settings');
            settingsRef.set(settings);
        } catch (error) {
            console.error('Firebase 설정 저장 오류:', error);
        }
    }

    // 설정 동기화
    syncSettings(firebaseSettings) {
        // Firebase에서 받은 설정을 로컬에 적용
        if (firebaseSettings.vacationPeriod) {
            this.vacationStart = firebaseSettings.vacationPeriod.start ?
                new Date(firebaseSettings.vacationPeriod.start) : null;
            this.vacationEnd = firebaseSettings.vacationPeriod.end ?
                new Date(firebaseSettings.vacationPeriod.end) : null;
        }

        if (firebaseSettings.holidays) {
            this.holidays = firebaseSettings.holidays.map(h => new Date(h));
        }

        this.updateVacationPeriodDisplay();
        this.renderCalendar();
    }

    renderCalendar() {
        const calendar = document.getElementById('calendar');
        const monthElement = document.getElementById('current-month');

        // 현재 월 표시
        monthElement.textContent = `${this.currentDate.getFullYear()}년 ${this.currentDate.getMonth() + 1}월`;

        // 달력 초기화
        calendar.innerHTML = '';

        // 첫 번째 날과 마지막 날 계산
        const firstDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
        const lastDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0);
        const firstDayOfWeek = firstDay.getDay();

        // 이전 달의 마지막 날들
        const prevMonth = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 0);
        for (let i = firstDayOfWeek - 1; i >= 0; i--) {
            const day = prevMonth.getDate() - i;
            const dayElement = this.createDayElement(day, true);
            calendar.appendChild(dayElement);
        }

        // 현재 달의 날들
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const dayElement = this.createDayElement(day, false);
            calendar.appendChild(dayElement);
        }

        // 다음 달의 첫 번째 날들
        const remainingCells = 42 - (firstDayOfWeek + lastDay.getDate());
        for (let day = 1; day <= remainingCells; day++) {
            const dayElement = this.createDayElement(day, true);
            calendar.appendChild(dayElement);
        }
    }

    createDayElement(day, isOtherMonth) {
        const dayElement = document.createElement('div');
        dayElement.classList.add('calendar-day');

        if (isOtherMonth) {
            dayElement.classList.add('other-month');
        }

        const currentDateObj = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), day);

        // 주말 체크
        if (currentDateObj.getDay() === 0 || currentDateObj.getDay() === 6) {
            dayElement.classList.add('weekend');
        }

        // 공휴일 체크
        if (this.isHoliday(currentDateObj)) {
            dayElement.classList.add('holiday');
        }

        dayElement.innerHTML = `<span>${day}</span>`;

        // 신청된 복무 유형 표시 및 날짜 스타일 적용
        if (!isOtherMonth && this.isWorkDay(currentDateObj)) {
            const dateKey = this.formatDateForStorage(currentDateObj);
            const detailInfo = this.detailSchedule?.[dateKey];

            if (detailInfo && detailInfo.length > 0) {
                // 주말 제외 플래그 확인
                const isWeekendExcluded = detailInfo.some(slot => slot.isWeekendExcluded);

                if (isWeekendExcluded) {
                    // 주말 제외 표시
                    dayElement.classList.add('duty-weekend-excluded');
                    const dutyElement = document.createElement('div');
                    dutyElement.classList.add('duty-type', 'type-weekend-excluded');
                    dutyElement.textContent = '제외';
                    dayElement.appendChild(dutyElement);
                } else {
                    // 세부 시간 정보가 있는 경우
                    const dutyTypes = [...new Set(detailInfo.map(slot => slot.type))]; // 중복 제거

                    if (dutyTypes.length === 1) {
                        // 단일 복무 유형
                        const dutyType = dutyTypes[0];
                        dayElement.classList.add(`duty-${dutyType}`);

                        const dutyElement = document.createElement('div');
                        dutyElement.classList.add('duty-type', `type-${dutyType}`);
                        dutyElement.textContent = this.getDutyTypeName(dutyType);
                        dayElement.appendChild(dutyElement);
                    } else if (dutyTypes.length > 1) {
                        // 여러 복무 유형 - 대각선 분할
                        dayElement.classList.add('duty-mixed');
                        dayElement.classList.add(`duty-mixed-${dutyTypes.sort().join('-')}`);

                        // 첫 번째와 두 번째 유형의 색상으로 대각선 분할
                        this.applyDiagonalSplit(dayElement, dutyTypes);

                        const dutyElement = document.createElement('div');
                        dutyElement.classList.add('duty-type', 'type-mixed');
                        dutyElement.textContent = dutyTypes.map(type => this.getDutyTypeName(type)).join('+');

                        // 텍스트 박스도 같은 대각선 패턴 적용
                        this.applyDiagonalSplitToText(dutyElement, dutyTypes);

                        dayElement.appendChild(dutyElement);
                    }
                }
            } else {
                // 기본 복무 유형 (기존 로직)
                const dutyType = this.getDutyType(currentDateObj);
                if (dutyType) {
                    dayElement.classList.add(`duty-${dutyType}`);

                    const dutyElement = document.createElement('div');
                    dutyElement.classList.add('duty-type', `type-${dutyType}`);
                    dutyElement.textContent = this.getDutyTypeName(dutyType);
                    dayElement.appendChild(dutyElement);
                }
            }
        }

        // 드래그 앤 드롭 이벤트 추가
        if (!isOtherMonth && this.isWorkDay(currentDateObj)) {
            dayElement.draggable = true;
            dayElement.dataset.date = this.formatDateForStorage(currentDateObj);

            dayElement.addEventListener('dragstart', (e) => this.handleDragStart(e, currentDateObj));
            dayElement.addEventListener('dragend', (e) => this.handleDragEnd(e));

            // 우클릭 이벤트 추가 (미세조정 모달)
            dayElement.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showDetailModal(currentDateObj);
            });
        }

        return dayElement;
    }

    // 대각선 분할 스타일 적용
    applyDiagonalSplit(dayElement, dutyTypes) {
        const colorMap = {
            '41': 'rgba(76, 175, 80, 0.3)',     // 녹색
            'work': 'rgba(33, 150, 243, 0.3)',  // 파란색
            'business': 'rgba(255, 152, 0, 0.3)', // 주황색
            'vacation': 'rgba(244, 67, 54, 0.3)', // 빨간색
            'overseas': 'rgba(156, 39, 176, 0.3)' // 보라색
        };

        const borderMap = {
            '41': '#4CAF50',
            'work': '#2196F3',
            'business': '#FF9800',
            'vacation': '#F44336',
            'overseas': '#9C27B0'
        };

        if (dutyTypes.length === 2) {
            // 2개 유형 - 대각선 분할
            const color1 = colorMap[dutyTypes[0]] || 'rgba(200, 200, 200, 0.3)';
            const color2 = colorMap[dutyTypes[1]] || 'rgba(200, 200, 200, 0.3)';
            const border1 = borderMap[dutyTypes[0]] || '#ccc';
            const border2 = borderMap[dutyTypes[1]] || '#ccc';

            dayElement.style.background = `linear-gradient(45deg, ${color1} 50%, ${color2} 50%)`;
            // 테두리도 대각선 그라디언트 적용
            dayElement.style.border = `3px solid`;
            dayElement.style.borderImage = `linear-gradient(45deg, ${border1} 50%, ${border2} 50%) 1`;
        } else if (dutyTypes.length === 3) {
            // 3개 유형 - 삼등분
            const color1 = colorMap[dutyTypes[0]] || 'rgba(200, 200, 200, 0.3)';
            const color2 = colorMap[dutyTypes[1]] || 'rgba(200, 200, 200, 0.3)';
            const color3 = colorMap[dutyTypes[2]] || 'rgba(200, 200, 200, 0.3)';
            const border1 = borderMap[dutyTypes[0]] || '#ccc';
            const border2 = borderMap[dutyTypes[1]] || '#ccc';
            const border3 = borderMap[dutyTypes[2]] || '#ccc';

            dayElement.style.background = `linear-gradient(45deg, ${color1} 33%, ${color2} 33%, ${color2} 66%, ${color3} 66%)`;
            dayElement.style.border = `3px solid`;
            dayElement.style.borderImage = `linear-gradient(45deg, ${border1} 33%, ${border2} 33%, ${border2} 66%, ${border3} 66%) 1`;
        } else {
            // 4개 이상 - 체크무늬 패턴
            const color1 = colorMap[dutyTypes[0]] || 'rgba(200, 200, 200, 0.3)';
            const color2 = colorMap[dutyTypes[1]] || 'rgba(200, 200, 200, 0.3)';
            const border1 = borderMap[dutyTypes[0]] || '#ccc';
            const border2 = borderMap[dutyTypes[1]] || '#ccc';

            dayElement.style.background = `
                repeating-linear-gradient(
                    45deg,
                    ${color1},
                    ${color1} 10px,
                    ${color2} 10px,
                    ${color2} 20px
                )
            `;
            dayElement.style.border = `3px solid`;
            dayElement.style.borderImage = `repeating-linear-gradient(45deg, ${border1}, ${border1} 5px, ${border2} 5px, ${border2} 10px) 1`;
        }
    }

    // 텍스트 박스에 대각선 분할 스타일 적용
    applyDiagonalSplitToText(textElement, dutyTypes) {
        const colorMap = {
            '41': 'rgba(76, 175, 80, 0.9)',     // 진한 녹색
            'work': 'rgba(33, 150, 243, 0.9)',  // 진한 파란색
            'business': 'rgba(255, 152, 0, 0.9)', // 진한 주황색
            'vacation': 'rgba(244, 67, 54, 0.9)', // 진한 빨간색
            'overseas': 'rgba(156, 39, 176, 0.9)' // 진한 보라색
        };

        if (dutyTypes.length === 2) {
            // 2개 유형 - 대각선 분할
            const color1 = colorMap[dutyTypes[0]] || 'rgba(100, 100, 100, 0.9)';
            const color2 = colorMap[dutyTypes[1]] || 'rgba(100, 100, 100, 0.9)';

            textElement.style.background = `linear-gradient(45deg, ${color1} 50%, ${color2} 50%)`;
            textElement.style.color = 'white';
            textElement.style.textShadow = '1px 1px 2px rgba(0,0,0,0.8)';
        } else if (dutyTypes.length === 3) {
            // 3개 유형 - 삼등분
            const color1 = colorMap[dutyTypes[0]] || 'rgba(100, 100, 100, 0.9)';
            const color2 = colorMap[dutyTypes[1]] || 'rgba(100, 100, 100, 0.9)';
            const color3 = colorMap[dutyTypes[2]] || 'rgba(100, 100, 100, 0.9)';

            textElement.style.background = `linear-gradient(45deg, ${color1} 33%, ${color2} 33%, ${color2} 66%, ${color3} 66%)`;
            textElement.style.color = 'white';
            textElement.style.textShadow = '1px 1px 2px rgba(0,0,0,0.8)';
        } else {
            // 4개 이상 - 체크무늬 패턴
            const color1 = colorMap[dutyTypes[0]] || 'rgba(100, 100, 100, 0.9)';
            const color2 = colorMap[dutyTypes[1]] || 'rgba(100, 100, 100, 0.9)';

            textElement.style.background = `
                repeating-linear-gradient(
                    45deg,
                    ${color1},
                    ${color1} 5px,
                    ${color2} 5px,
                    ${color2} 10px
                )
            `;
            textElement.style.color = 'white';
            textElement.style.textShadow = '1px 1px 2px rgba(0,0,0,0.8)';
        }
    }

    isWorkDay(date) {
        // 방학 기간이 설정되지 않았으면 false
        if (!this.vacationStart || !this.vacationEnd) {
            return false;
        }

        // 날짜만 비교하기 위해 시간 정보 제거
        const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const startOnly = new Date(this.vacationStart.getFullYear(), this.vacationStart.getMonth(), this.vacationStart.getDate());
        const endOnly = new Date(this.vacationEnd.getFullYear(), this.vacationEnd.getMonth(), this.vacationEnd.getDate());

        // 방학 기간 내에 있고, 공휴일이 아닌 날 (주말 포함)
        return dateOnly >= startOnly &&
               dateOnly <= endOnly &&
               !this.isHoliday(date);
    }

    isHoliday(date) {
        return this.holidays.some(holiday =>
            holiday.toDateString() === date.toDateString()
        );
    }

    getDutyType(date) {
        const dateString = this.formatDateForStorage(date);
        return this.dutySchedule[dateString] || null;
    }

    getDutyTypeName(type) {
        const types = {
            '41': '41조',
            'work': '근무',
            'business': '출장',
            'vacation': '연가',
            'overseas': '국외',
            'weekend-excluded': '제외'
        };
        return types[type] || '';
    }

    startSelection(date) {
        this.isSelecting = true;
        this.selectionStart = date;
        this.selectedDates = [date];
        this.updateSelectedDisplay();
        this.highlightSelection();
    }

    updateSelection(date) {
        if (!this.isSelecting || !this.selectionStart) return;

        // 범위 선택
        const start = this.selectionStart;
        const end = date;
        this.selectedDates = this.getDateRange(start, end);
        this.updateSelectedDisplay();
        this.highlightSelection();
    }

    endSelection() {
        this.isSelecting = false;
    }

    getDateRange(start, end) {
        const dates = [];
        const current = new Date(Math.min(start, end));
        const last = new Date(Math.max(start, end));

        while (current <= last) {
            if (this.isWorkDay(current)) {
                dates.push(new Date(current));
            }
            current.setDate(current.getDate() + 1);
        }

        return dates;
    }

    updateSelectedDisplay() {
        const selectedPeriod = document.getElementById('selected-period');
        if (!selectedPeriod) return; // 요소가 없으면 종료

        if (this.selectedDates.length === 0) {
            selectedPeriod.value = '';
        } else if (this.selectedDates.length === 1) {
            selectedPeriod.value = this.formatDate(this.selectedDates[0]);
        } else {
            const start = this.selectedDates[0];
            const end = this.selectedDates[this.selectedDates.length - 1];
            selectedPeriod.value = `${this.formatDate(start)} ~ ${this.formatDate(end)} (${this.selectedDates.length}일)`;
        }
    }

    highlightSelection() {
        // 모든 선택 효과 제거
        document.querySelectorAll('.calendar-day').forEach(day => {
            day.classList.remove('selected', 'selected-range');
        });

        // 새로운 선택 효과 추가
        this.selectedDates.forEach((date, index) => {
            const dayElement = this.findDayElement(date);
            if (dayElement) {
                if (index === 0 || index === this.selectedDates.length - 1) {
                    dayElement.classList.add('selected');
                } else {
                    dayElement.classList.add('selected-range');
                }
            }
        });
    }

    findDayElement(date) {
        const dayElements = document.querySelectorAll('.calendar-day:not(.other-month)');
        return Array.from(dayElements).find(element => {
            const dayNumber = parseInt(element.querySelector('span').textContent);
            const elementDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), dayNumber);
            return elementDate.toDateString() === date.toDateString();
        });
    }

    formatDate(date) {
        return `${date.getMonth() + 1}월 ${date.getDate()}일`;
    }

    formatDateForStorage(date) {
        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    }

    // 자동 계산 정보 생성
    generateCalculationInfo() {
        const totalWorkDays = this.getTotalWorkDaysInVacation();
        const selectedDays = this.selectedDates.length;
        const remainingDays = totalWorkDays - selectedDays;
        const completionRate = Math.round((selectedDays / totalWorkDays) * 100);

        // 결재 소요 시간 계산
        const approvalDuration = this.getApprovalDuration();

        // 최적 신청 시점 계산
        const optimalSubmissionDate = this.getOptimalSubmissionDate();

        return {
            totalWorkDays,
            selectedDays,
            remainingDays,
            completionRate,
            approvalDuration,
            optimalSubmissionDate,
            vacationProgress: this.getVacationProgress()
        };
    }

    // 방학 기간 내 총 근무일수 계산
    getTotalWorkDaysInVacation() {
        if (!this.vacationStart || !this.vacationEnd) return 0;

        let count = 0;
        const current = new Date(this.vacationStart);

        while (current <= this.vacationEnd) {
            if (this.isWorkDay(current)) {
                count++;
            }
            current.setDate(current.getDate() + 1);
        }

        return count;
    }

    // 결재 소요 시간 계산
    getApprovalDuration() {
        const dutyType = document.getElementById('duty-type').value;

        switch (dutyType) {
            case '41':
                return { days: '2-3일', reason: '미래교육연구부장 → 교감 → 교장' };
            case 'business':
                return { days: '1-2일', reason: '교감 → 교장' };
            case 'vacation':
                return { days: '3-4일', reason: '교무기획부장 → 교감 → 교장 + 휴업일 처리' };
            case 'overseas':
                return { days: '5-7일', reason: '계획서 검토 + 미래교육연구부장 → 교감 → 교장' };
            default:
                return { days: '2-3일', reason: '일반적인 결재 라인' };
        }
    }

    // 최적 신청 시점 계산
    getOptimalSubmissionDate() {
        if (this.selectedDates.length === 0) return null;

        const firstSelectedDate = this.selectedDates[0];
        const dutyType = document.getElementById('duty-type').value;

        // 결재 소요 기간에 따른 최적 신청일 계산
        let recommendedDaysBefore;
        switch (dutyType) {
            case 'overseas':
                recommendedDaysBefore = 10; // 계획서 작성 시간 포함
                break;
            case 'vacation':
                recommendedDaysBefore = 7;
                break;
            default:
                recommendedDaysBefore = 5;
        }

        const optimalDate = new Date(firstSelectedDate);
        optimalDate.setDate(optimalDate.getDate() - recommendedDaysBefore);

        const today = new Date();
        const isOptimal = today <= optimalDate;

        return {
            date: optimalDate,
            isOptimal,
            daysLeft: Math.ceil((optimalDate - today) / (1000 * 60 * 60 * 24))
        };
    }

    // 방학 진행률 계산
    getVacationProgress() {
        if (!this.vacationStart || !this.vacationEnd) return null;

        const today = new Date();
        const totalDays = Math.ceil((this.vacationEnd - this.vacationStart) / (1000 * 60 * 60 * 24));
        const passedDays = Math.max(0, Math.ceil((today - this.vacationStart) / (1000 * 60 * 60 * 24)));
        const progressRate = Math.min(100, Math.round((passedDays / totalDays) * 100));

        return {
            totalDays,
            passedDays,
            progressRate,
            remainingDays: Math.max(0, totalDays - passedDays)
        };
    }

    generateApprovalInfo() {
        const teacherName = document.getElementById('teacher-name').value.trim();
        const teacherDepartment = document.getElementById('teacher-department').value.trim();

        // 유효성 검사
        if (!teacherName || !teacherDepartment) {
            alert('이름과 부서를 입력해주세요.');
            return;
        }

        // dutySchedule에서 복무 일정 확인
        const dutyGroups = this.generateDutyGroups();

        if (dutyGroups.length === 0) {
            alert('설정된 복무 일정이 없습니다. 먼저 방학 기간을 설정해주세요.');
            return;
        }

        // 결재 라인별로 그룹 분류
        const line1Groups = dutyGroups.filter(group => ['41', 'work', 'overseas'].includes(group.type));
        const line2Groups = dutyGroups.filter(group => ['business', 'vacation'].includes(group.type));

        // 결재 정보 생성
        this.generateApprovalByLines(line1Groups, line2Groups, teacherName, teacherDepartment);
    }

    // dutySchedule에서 연속 구간별로 그룹화
    generateDutyGroups() {
        // 날짜별로 정렬
        const sortedEntries = Object.entries(this.dutySchedule)
            .sort(([dateA], [dateB]) => new Date(dateA) - new Date(dateB));

        const groups = [];
        let currentGroup = null;

        sortedEntries.forEach(([dateString, dutyType]) => {
            const date = new Date(dateString);

            // work는 결재 상신에서 제외
            if (dutyType === 'work') {
                return;
            }

            // 같은 타입이고 연속된 날짜면 그룹에 추가
            if (currentGroup &&
                this.isSameDutyType(currentGroup.type, dutyType) &&
                this.isConsecutiveDayForGroup(currentGroup.endDate, date)) {

                // 기존 그룹에 추가
                currentGroup.endDate = date;
                currentGroup.dates.push(date);
                currentGroup.dateStrings.push(dateString);
            } else {
                // 새 그룹 시작
                if (currentGroup) {
                    groups.push(currentGroup);
                }

                currentGroup = {
                    type: dutyType,
                    startDate: date,
                    endDate: date,
                    dates: [date],
                    dateStrings: [dateString]
                };
            }
        });

        // 마지막 그룹 추가
        if (currentGroup) {
            groups.push(currentGroup);
        }

        return groups;
    }

    // 같은 복무 타입인지 확인
    isSameDutyType(type1, type2) {
        return type1 === type2;
    }

    // 연속일인지 확인 (그룹화용 - 주말 포함)
    isConsecutiveDayForGroup(lastDate, currentDate) {
        const dayDiff = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));
        return dayDiff === 1;
    }

    // 연속일인지 확인 (공휴일만 건너뛰기, 주말 포함)
    isConsecutiveDay(lastDate, currentDate) {
        const nextDay = new Date(lastDate);
        nextDay.setDate(nextDay.getDate() + 1);

        // 공휴일은 건너뛰고 다음 날 찾기
        while (this.isHoliday(nextDay) && nextDay <= currentDate) {
            nextDay.setDate(nextDay.getDate() + 1);
        }

        return nextDay.toDateString() === currentDate.toDateString();
    }

    generateApprovalByLines(line1Groups, line2Groups, teacherName, teacherDepartment) {
        // 라인 1 처리
        const content1 = document.getElementById('approval-content1');
        if (line1Groups.length > 0) {
            content1.innerHTML = this.generateLineContent(line1Groups, teacherName, teacherDepartment, 1);
        } else {
            content1.innerHTML = '해당하는 복무 유형이 없습니다.';
        }

        // 라인 2 처리
        const content2 = document.getElementById('approval-content2');
        if (line2Groups.length > 0) {
            content2.innerHTML = this.generateLineContent(line2Groups, teacherName, teacherDepartment, 2);
        } else {
            content2.innerHTML = '해당하는 복무 유형이 없습니다.';
        }
    }

    generateLineContent(groups, teacherName, teacherDepartment, lineNumber) {
        let content = '';

        groups.forEach((group, index) => {
            const startDate = group.startDate;
            const endDate = group.endDate;
            const dayCount = group.dates.length;
            const dutyType = group.type;

            const year = startDate.getFullYear();
            const startMonth = startDate.getMonth() + 1;
            const startDay = startDate.getDate();
            const endMonth = endDate.getMonth() + 1;
            const endDay = endDate.getDate();

            // 시간 정보 생성
            const timeInfo = this.getTimeInfoForGroup(group);

            content += `${index + 1}. ${this.getDutyTypeName(dutyType)} : ${year}년 ${startMonth}월 ${startDay}일(${this.getDayOfWeek(startDate)}) ${timeInfo.startTime} ~ ${year}년 ${endMonth}월 ${endDay}일(${this.getDayOfWeek(endDate)}) ${timeInfo.endTime} (${dayCount}일)<br>`;
        });

        return content;
    }

    // 그룹별 시간 정보 가져오기
    getTimeInfoForGroup(group) {
        const startDateKey = this.formatDateForStorage(group.startDate);
        const endDateKey = this.formatDateForStorage(group.endDate);

        // 세부 시간 설정이 있는지 확인
        const startDetails = this.detailSchedule?.[startDateKey];
        const endDetails = this.detailSchedule?.[endDateKey];

        let startTime = '08:40'; // 기본 시작 시간
        let endTime = '16:40';   // 기본 종료 시간

        // 시작일의 첫 번째 시간 슬롯의 시작 시간
        if (startDetails && startDetails.length > 0) {
            const firstSlot = startDetails.find(slot => slot.type === group.type) || startDetails[0];
            startTime = firstSlot.start;
        }

        // 종료일의 마지막 시간 슬롯의 종료 시간
        if (endDetails && endDetails.length > 0) {
            const lastSlot = endDetails.filter(slot => slot.type === group.type).pop() || endDetails[endDetails.length - 1];
            endTime = lastSlot.end;
        }

        return {
            startTime,
            endTime
        };
    }

    // 자동 계산 정보 표시 생성
    createCalculationDisplay(info) {
        let html = `
            <div class="approval-item" style="background: #e8f4f8; border: 2px solid #17a2b8;">
                <div class="approval-item-header" style="color: #17a2b8;">
                    📊 자동 계산 정보
                </div>
                <div style="padding: 10px; font-family: 'Malgun Gothic', sans-serif;">
        `;

        // 방학 근무일 정보
        html += `
                    <div style="margin-bottom: 15px;">
                        <strong>📅 방학 근무일 현황</strong><br>
                        • 전체 근무일: <span style="color: #007bff; font-weight: bold;">${info.totalWorkDays}일</span><br>
                        • 선택한 일수: <span style="color: #28a745; font-weight: bold;">${info.selectedDays}일</span><br>
                        • 남은 근무일: <span style="color: #6c757d;">${info.remainingDays}일</span><br>
                        • 신청 비율: <span style="color: #dc3545; font-weight: bold;">${info.completionRate}%</span>
                    </div>
        `;

        // 방학 진행률
        if (info.vacationProgress) {
            const progress = info.vacationProgress;
            html += `
                    <div style="margin-bottom: 15px;">
                        <strong>📈 방학 진행률</strong><br>
                        • 전체 방학: ${progress.totalDays}일<br>
                        • 진행률: <span style="color: #17a2b8; font-weight: bold;">${progress.progressRate}%</span><br>
                        • 남은 방학: ${progress.remainingDays}일
                    </div>
            `;
        }

        // 결재 소요 시간
        html += `
                    <div style="margin-bottom: 15px;">
                        <strong>⏱️ 예상 결재 소요시간</strong><br>
                        • 소요 기간: <span style="color: #fd7e14; font-weight: bold;">${info.approvalDuration.days}</span><br>
                        • 결재 라인: ${info.approvalDuration.reason}
                    </div>
        `;

        // 최적 신청 시점
        if (info.optimalSubmissionDate) {
            const optimal = info.optimalSubmissionDate;
            const statusColor = optimal.isOptimal ? '#28a745' : '#dc3545';
            const statusText = optimal.isOptimal ? '✅ 적절한 시점' : '⚠️ 늦은 신청';

            html += `
                    <div style="margin-bottom: 15px;">
                        <strong>📋 신청 시점 분석</strong><br>
                        • 권장 신청일: ${this.formatDate(optimal.date)}<br>
                        • 현재 상태: <span style="color: ${statusColor}; font-weight: bold;">${statusText}</span><br>
            `;

            if (!optimal.isOptimal && optimal.daysLeft < 0) {
                html += `        • 권장 신청일을 ${Math.abs(optimal.daysLeft)}일 초과했습니다.`;
            } else if (optimal.daysLeft > 0) {
                html += `        • 신청까지 ${optimal.daysLeft}일 남았습니다.`;
            }

            html += `</div>`;
        }

        html += `
                </div>
            </div>
        `;

        return html;
    }

    groupConsecutiveDates(dates) {
        if (dates.length === 0) return [];

        const sortedDates = [...dates].sort((a, b) => a - b);
        const groups = [];
        let currentGroup = [sortedDates[0]];

        for (let i = 1; i < sortedDates.length; i++) {
            const prevDate = sortedDates[i - 1];
            const currDate = sortedDates[i];

            // 하루 차이인지 확인 (주말 제외하고)
            if (this.isConsecutiveWorkDay(prevDate, currDate)) {
                currentGroup.push(currDate);
            } else {
                groups.push(currentGroup);
                currentGroup = [currDate];
            }
        }

        groups.push(currentGroup);
        return groups;
    }

    isConsecutiveWorkDay(date1, date2) {
        const nextDay = new Date(date1);
        nextDay.setDate(nextDay.getDate() + 1);

        // 주말이나 공휴일은 건너뛰고 다음 근무일 찾기
        while (!this.isWorkDay(nextDay) && nextDay <= date2) {
            nextDay.setDate(nextDay.getDate() + 1);
        }

        return nextDay.toDateString() === date2.toDateString();
    }

    createApprovalData(type, startDate, endDate, dayCount, reason, destination) {
        const year = startDate.getFullYear();
        const startMonth = startDate.getMonth() + 1;
        const startDay = startDate.getDate();
        const endMonth = endDate.getMonth() + 1;
        const endDay = endDate.getDate();

        let approvalText = '';

        switch (type) {
            case '41':
                approvalText = `📅 기간: ${year}년 ${startMonth}월 ${startDay}일(${this.getDayOfWeek(startDate)}) ~ ${year}년 ${endMonth}월 ${endDay}일(${this.getDayOfWeek(endDate)}) (${dayCount}일)`;
                break;

            case 'work':
                approvalText = `📅 기간: ${year}년 ${startMonth}월 ${startDay}일(${this.getDayOfWeek(startDate)}) ~ ${year}년 ${endMonth}월 ${endDay}일(${this.getDayOfWeek(endDate)}) (${dayCount}일)`;
                break;

            case 'business':
                approvalText = `📅 기간: ${year}년 ${startMonth}월 ${startDay}일(${this.getDayOfWeek(startDate)}) ~ ${year}년 ${endMonth}월 ${endDay}일(${this.getDayOfWeek(endDate)}) (${dayCount}일)`;
                break;

            case 'vacation':
                approvalText = `📅 기간: ${year}년 ${startMonth}월 ${startDay}일(${this.getDayOfWeek(startDate)}) ~ ${year}년 ${endMonth}월 ${endDay}일(${this.getDayOfWeek(endDate)}) (${dayCount}일)`;
                break;

            case 'overseas':
                approvalText = `📅 기간: ${year}년 ${startMonth}월 ${startDay}일(${this.getDayOfWeek(startDate)}) ~ ${year}년 ${endMonth}월 ${endDay}일(${this.getDayOfWeek(endDate)}) (${dayCount}일)`;
                break;
        }

        return approvalText;
    }

    getDayOfWeek(date) {
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        return days[date.getDay()];
    }

    copyApprovalInfo() {
        const approvalText = document.getElementById('approval-info').innerText;
        navigator.clipboard.writeText(approvalText).then(() => {
            alert('결재 정보가 클립보드에 복사되었습니다!');
        }).catch(() => {
            alert('복사 기능을 지원하지 않는 브라우저입니다.');
        });
    }

    copyApprovalContent(elementId) {
        const approvalText = document.getElementById(elementId).innerText;
        navigator.clipboard.writeText(approvalText).then(() => {
            alert('결재 정보가 클립보드에 복사되었습니다!');
        }).catch(() => {
            alert('복사 기능을 지원하지 않는 브라우저입니다.');
        });
    }

    // 미세조정 모달 관련 기능
    showDetailModal(date) {
        this.currentDetailDate = date;
        const dateString = this.formatDate(date);
        document.getElementById('modal-date-title').textContent = `${dateString} 세부 복무 설정`;

        // 기존 시간 슬롯 초기화
        this.initializeTimeSlots(date);

        document.getElementById('detail-modal').style.display = 'flex';
    }

    initializeTimeSlots(date) {
        const container = document.getElementById('time-slots-container');
        container.innerHTML = '';

        const dateKey = this.formatDateForStorage(date);
        const existingDetails = this.detailSchedule?.[dateKey];

        if (existingDetails && existingDetails.length > 0) {
            // 기존 설정이 있으면 그것을 사용
            existingDetails.forEach(detail => {
                this.addTimeSlotToContainer(detail.start, detail.end, detail.type);
            });
        } else {
            // 기본 설정 추가 (8:40-16:40 전체)
            const currentType = this.getDutyType(date) || '41';
            this.addTimeSlotToContainer('08:40', '16:40', currentType);
        }
    }

    addTimeSlotToContainer(startTime = '08:40', endTime = '16:40', dutyType = '41') {
        const container = document.getElementById('time-slots-container');
        const slotDiv = document.createElement('div');
        slotDiv.className = 'time-slot';

        slotDiv.innerHTML = `
            <input type="time" class="time-input start-time" value="${startTime}">
            <input type="time" class="time-input end-time" value="${endTime}">
            <select class="time-duty-type">
                <option value="41" ${dutyType === '41' ? 'selected' : ''}>41조 연수</option>
                <option value="work" ${dutyType === 'work' ? 'selected' : ''}>근무</option>
                <option value="business" ${dutyType === 'business' ? 'selected' : ''}>출장</option>
                <option value="vacation" ${dutyType === 'vacation' ? 'selected' : ''}>연가</option>
                <option value="overseas" ${dutyType === 'overseas' ? 'selected' : ''}>국외연수</option>
            </select>
            <button class="delete-slot" onclick="removeTimeSlot(this)">×</button>
        `;

        container.appendChild(slotDiv);
    }

    closeDetailModal() {
        document.getElementById('detail-modal').style.display = 'none';
        this.currentDetailDate = null;
    }

    saveDetailSettings() {
        if (!this.currentDetailDate) return;

        const timeSlots = document.querySelectorAll('.time-slot');
        const timeDetails = [];

        timeSlots.forEach(slot => {
            const startTime = slot.querySelector('.start-time').value;
            const endTime = slot.querySelector('.end-time').value;
            const dutyType = slot.querySelector('.time-duty-type').value;

            if (startTime && endTime) {
                timeDetails.push({
                    start: startTime,
                    end: endTime,
                    type: dutyType
                });
            }
        });

        // 시간순으로 정렬
        timeDetails.sort((a, b) => a.start.localeCompare(b.start));

        // 시간별 세부 정보를 저장
        const dateKey = this.formatDateForStorage(this.currentDetailDate);
        if (!this.detailSchedule) {
            this.detailSchedule = {};
        }
        this.detailSchedule[dateKey] = timeDetails;

        // 기본 복무 일정도 업데이트 (가장 많이 사용된 유형으로)
        if (timeDetails.length > 0) {
            const typeCounts = {};
            timeDetails.forEach(detail => {
                typeCounts[detail.type] = (typeCounts[detail.type] || 0) + 1;
            });
            const mostUsedType = Object.keys(typeCounts).reduce((a, b) => typeCounts[a] > typeCounts[b] ? a : b);
            this.dutySchedule[dateKey] = mostUsedType;
        }

        this.closeDetailModal();
        this.renderCalendar();
        this.saveVacationSettings();
    }

    addTimeSlot() {
        this.addTimeSlotToContainer();
    }

    removeTimeSlot(button) {
        const container = document.getElementById('time-slots-container');
        if (container.children.length > 1) {
            button.parentElement.remove();
        } else {
            alert('최소 하나의 시간 슬롯은 유지해야 합니다.');
        }
    }

    clearSelection() {
        this.selectedDates = [];
        this.selectionStart = null;
        this.updateSelectedDisplay();
        this.highlightSelection();
    }


    saveApplications() {
        localStorage.setItem('vacation-duty-applications', JSON.stringify(this.applications));

        // Firebase에도 저장 (최신 신청만)
        if (this.applications.length > 0) {
            const latestApplication = this.applications[this.applications.length - 1];
            this.saveApplicationToFirebase(latestApplication);
        }
    }

    loadApplications() {
        const saved = localStorage.getItem('vacation-duty-applications');
        if (saved) {
            this.applications = JSON.parse(saved);
            this.renderApplicationList();
        }
    }

    renderApplicationList() {
        const listContainer = document.getElementById('application-list');

        if (this.applications.length === 0) {
            listContainer.innerHTML = '<p class="text-center opacity-60">신청 내역이 없습니다</p>';
            return;
        }

        listContainer.innerHTML = this.applications.map(app => `
            <div class="application-item">
                <div class="application-header">
                    <span class="application-type type-${app.type}">${this.getDutyTypeName(app.type)}</span>
                    <span class="status-${app.status}">${app.status === 'pending' ? '대기중' : '승인됨'}</span>
                </div>
                <div style="font-size: 12px; margin-bottom: 8px;">
                    ${app.dates.length}일 (${app.dates[0]} ~ ${app.dates[app.dates.length - 1]})
                </div>
                <div style="font-size: 12px; opacity: 0.8;">
                    ${app.reason}
                </div>
                <button class="btn btn-danger" style="font-size: 12px; padding: 6px 12px; margin-top: 8px;"
                        onclick="dutyManager.deleteApplication(${app.id})">
                    삭제
                </button>
            </div>
        `).join('');
    }

    deleteApplication(id) {
        if (confirm('이 신청을 삭제하시겠습니까?')) {
            this.applications = this.applications.filter(app => app.id !== id);

            // 로컬 및 Firebase에서 삭제
            localStorage.setItem('vacation-duty-applications', JSON.stringify(this.applications));
            this.deleteApplicationFromFirebase(id);

            this.renderApplicationList();
            this.renderCalendar();
        }
    }

    changeMonth(direction) {
        // 안전한 월 변경을 위해 날짜를 1일로 설정 후 월 변경
        const currentMonth = this.currentDate.getMonth();
        const currentYear = this.currentDate.getFullYear();

        this.currentDate = new Date(currentYear, currentMonth + direction, 1);

        this.clearSelection();
        this.renderCalendar();
    }

    setVacationPeriod() {
        const schoolYear = document.getElementById('school-year').value;
        const vacationType = document.getElementById('vacation-type').value;
        const startDate = document.getElementById('vacation-start').value;
        const endDate = document.getElementById('vacation-end').value;

        if (!startDate || !endDate) {
            alert('방학 시작일과 종료일을 모두 입력해주세요.');
            return;
        }

        this.vacationStart = new Date(startDate);
        this.vacationEnd = new Date(endDate);

        if (this.vacationStart >= this.vacationEnd) {
            alert('종료일은 시작일보다 나중이어야 합니다.');
            return;
        }

        // 공휴일 자동 설정
        this.setHolidays(parseInt(schoolYear), vacationType);

        // 모든 근무일을 41조로 자동 설정
        this.initializeDutySchedule();

        // 설정 저장
        this.saveVacationSettings();

        // UI 업데이트
        this.updateVacationPeriodDisplay();
        this.renderCalendar();

        alert('방학 기간이 설정되었습니다! 모든 근무일이 41조 연수로 설정되었습니다.');
    }

    setHolidays(year, type) {
        this.holidays = [];

        if (type === 'summer') {
            // 여름방학 공휴일: 8월 15일 광복절
            this.holidays.push(new Date(year, 7, 15));
        } else if (type === 'winter') {
            // 겨울방학 공휴일: 1월 1일 신정, 설날 등
            this.holidays.push(new Date(year + 1, 0, 1)); // 신정

            // 2026년 설 연휴 (2월 16일~18일)
            if (year === 2025) { // 2026년 겨울방학
                this.holidays.push(new Date(2026, 1, 16)); // 설날 전날
                this.holidays.push(new Date(2026, 1, 17)); // 설날
                this.holidays.push(new Date(2026, 1, 18)); // 설날 다음날
            }

            // TODO: 다른 연도 설날도 추가 필요
        }
    }

    // 모든 근무일을 41조로 초기 설정
    initializeDutySchedule() {
        this.dutySchedule = {};

        if (!this.vacationStart || !this.vacationEnd) return;

        const current = new Date(this.vacationStart);

        while (current <= this.vacationEnd) {
            if (this.isWorkDay(current)) {
                const dateString = this.formatDateForStorage(current);
                this.dutySchedule[dateString] = '41'; // 기본값: 41조 연수
            }
            current.setDate(current.getDate() + 1);
        }

        console.log('복무 일정 초기화 완료:', this.dutySchedule);
    }

    // 드롭존 설정
    setupDropZones() {
        const dropZones = document.querySelectorAll('.drop-zone');

        dropZones.forEach(zone => {
            zone.addEventListener('dragover', (e) => this.handleDragOver(e));
            zone.addEventListener('dragenter', (e) => this.handleDragEnter(e));
            zone.addEventListener('dragleave', (e) => this.handleDragLeave(e));
            zone.addEventListener('drop', (e) => this.handleDrop(e));
        });
    }

    // 드래그 시작
    handleDragStart(e, date) {
        this.draggedDate = date;
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.formatDateForStorage(date));
    }

    // 드래그 종료
    handleDragEnd(e) {
        e.target.classList.remove('dragging');
        this.draggedDate = null;
    }

    // 드래그 오버
    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    // 드래그 진입
    handleDragEnter(e) {
        e.preventDefault();
        e.target.closest('.drop-zone').classList.add('drag-over');
    }

    // 드래그 벗어남
    handleDragLeave(e) {
        if (!e.target.closest('.drop-zone').contains(e.relatedTarget)) {
            e.target.closest('.drop-zone').classList.remove('drag-over');
        }
    }

    // 드롭 처리
    handleDrop(e) {
        e.preventDefault();
        const dropZone = e.target.closest('.drop-zone');
        dropZone.classList.remove('drag-over');

        const dutyType = dropZone.dataset.type;
        const dateString = e.dataTransfer.getData('text/plain');

        if (dateString && dutyType) {
            this.changeDutyType(dateString, dutyType);
        }
    }

    // 복무 유형 변경
    changeDutyType(dateString, newType) {
        if (this.dutySchedule[dateString] !== newType) {
            this.dutySchedule[dateString] = newType;

            // 저장 및 화면 업데이트
            this.saveVacationSettings();
            this.renderCalendar();

            // 피드백 메시지
            const date = new Date(dateString);
            const typeName = this.getDutyTypeName(newType);
            console.log(`${this.formatDate(date)}을 ${typeName}으로 변경했습니다.`);
        }
    }

    updateVacationPeriodDisplay() {
        const periodElement = document.getElementById('vacation-period');

        // 요소가 존재하지 않으면 리턴 (사용자가 제거한 경우)
        if (!periodElement) {
            return;
        }

        const vacationType = document.getElementById('vacation-type').value;
        const schoolYear = document.getElementById('school-year').value;

        if (this.vacationStart && this.vacationEnd) {
            const typeText = vacationType === 'summer' ? '여름방학' : '겨울방학';
            const startText = this.formatDate(this.vacationStart);
            const endText = this.formatDate(this.vacationEnd);

            periodElement.textContent = `${schoolYear}학년도 ${typeText} (${startText} ~ ${endText})`;
        }
    }

    saveVacationSettings() {
        const settings = {
            schoolYear: 2026, // 하드코딩된 값
            vacationType: 'winter', // 하드코딩된 값 (겨울방학)
            vacationPeriod: {
                start: this.vacationStart ? this.vacationStart.toISOString() : null,
                end: this.vacationEnd ? this.vacationEnd.toISOString() : null
            },
            holidays: this.holidays.map(h => h.toISOString()),
            dutySchedule: this.dutySchedule
        };

        localStorage.setItem('vacation-settings', JSON.stringify(settings));

        // Firebase에도 저장
        this.saveToFirebase();
    }

    loadVacationSettings() {
        const saved = localStorage.getItem('vacation-settings');
        if (saved) {
            const settings = JSON.parse(saved);

            document.getElementById('school-year').value = settings.schoolYear || new Date().getFullYear();
            document.getElementById('vacation-type').value = settings.vacationType || 'summer';

            // 새로운 구조와 이전 구조 모두 지원
            if (settings.vacationPeriod) {
                if (settings.vacationPeriod.start) {
                    this.vacationStart = new Date(settings.vacationPeriod.start);
                    document.getElementById('vacation-start').value = settings.vacationPeriod.start.split('T')[0];
                }
                if (settings.vacationPeriod.end) {
                    this.vacationEnd = new Date(settings.vacationPeriod.end);
                    document.getElementById('vacation-end').value = settings.vacationPeriod.end.split('T')[0];
                }
            } else {
                // 이전 구조 호환성
                if (settings.vacationStart) {
                    this.vacationStart = new Date(settings.vacationStart);
                    document.getElementById('vacation-start').value = settings.vacationStart.split('T')[0];
                }
                if (settings.vacationEnd) {
                    this.vacationEnd = new Date(settings.vacationEnd);
                    document.getElementById('vacation-end').value = settings.vacationEnd.split('T')[0];
                }
            }

            if (settings.holidays) {
                this.holidays = settings.holidays.map(h => new Date(h));
            }

            if (settings.dutySchedule) {
                this.dutySchedule = settings.dutySchedule;
            }

            this.updateVacationPeriodDisplay();
        } else {
            // 기본값 설정
            document.getElementById('school-year').value = new Date().getFullYear();
        }
    }
}

// 전역 인스턴스 생성
let dutyManager;

// 페이지 로드 시 초기화
window.addEventListener('load', () => {
    dutyManager = new VacationDutyManager();
});

// 전역 함수들
function changeMonth(direction) {
    dutyManager.changeMonth(direction);
}

function submitApplication() {
    dutyManager.submitApplication();
}

function clearSelection() {
    dutyManager.clearSelection();
}

function setVacationPeriod() {
    dutyManager.setVacationPeriod();
}

function generateApprovalInfo() {
    dutyManager.generateApprovalInfo();
}

function copyApprovalInfo() {
    dutyManager.copyApprovalInfo();
}

function copyApprovalContent(elementId) {
    dutyManager.copyApprovalContent(elementId);
}

function closeDetailModal() {
    dutyManager.closeDetailModal();
}

function saveDetailSettings() {
    dutyManager.saveDetailSettings();
}

function addTimeSlot() {
    dutyManager.addTimeSlot();
}

function removeTimeSlot(button) {
    dutyManager.removeTimeSlot(button);
}


// 해외여행 위저드 관련 변수
let travelWizardData = {
    departureDate: null,
    departureTime: null,
    arrivalDate: null,
    arrivalTime: null,
    destination: null,
    dutyType: null,
    calculatedDates: []
};

// 해외여행 위저드 시작
function showTravelWizard() {
    document.getElementById('travel-wizard-modal').style.display = 'flex';
    goToStep1();
}

// 위저드 닫기
function closeTravelWizard() {
    document.getElementById('travel-wizard-modal').style.display = 'none';
    resetWizardData();
}

// 위저드 데이터 초기화
function resetWizardData() {
    travelWizardData = {
        departureDate: null,
        departureTime: null,
        arrivalDate: null,
        arrivalTime: null,
        destination: null,
        dutyType: null,
        calculatedDates: []
    };

    document.getElementById('departure-date').value = '';
    document.getElementById('departure-time').value = '22:00';
    document.getElementById('arrival-date').value = '';
    document.getElementById('arrival-time').value = '05:00';
    document.getElementById('travel-destination').value = '';

    document.querySelectorAll('.duty-option').forEach(option => {
        option.classList.remove('selected');
    });

    document.getElementById('next-step2').disabled = true;
}

// 1단계로 이동
function goToStep1() {
    hideAllSteps();
    document.getElementById('wizard-step1').style.display = 'block';
    document.getElementById('wizard-title').textContent = '해외여행 도우미 - 1단계';
}

// 2단계로 이동
function goToStep2() {
    // 1단계 유효성 검사
    const departureDate = document.getElementById('departure-date').value;
    const arrivalDate = document.getElementById('arrival-date').value;
    const destination = document.getElementById('travel-destination').value.trim();

    if (!departureDate || !arrivalDate || !destination) {
        alert('모든 항목을 입력해주세요.');
        return;
    }

    if (new Date(departureDate) >= new Date(arrivalDate)) {
        alert('입국일은 출국일보다 나중이어야 합니다.');
        return;
    }

    // 데이터 저장
    travelWizardData.departureDate = departureDate;
    travelWizardData.departureTime = document.getElementById('departure-time').value;
    travelWizardData.arrivalDate = arrivalDate;
    travelWizardData.arrivalTime = document.getElementById('arrival-time').value;
    travelWizardData.destination = destination;

    hideAllSteps();
    document.getElementById('wizard-step2').style.display = 'block';
    document.getElementById('wizard-title').textContent = '해외여행 도우미 - 2단계';
}

// 3단계로 이동
function goToStep3() {
    if (!travelWizardData.dutyType) {
        alert('복무 유형을 선택해주세요.');
        return;
    }

    // 자동 계산 수행
    calculateTravelDuty();

    hideAllSteps();
    document.getElementById('wizard-step3').style.display = 'block';
    document.getElementById('wizard-title').textContent = '해외여행 도우미 - 3단계';
}

// 모든 단계 숨기기
function hideAllSteps() {
    document.querySelectorAll('.wizard-step').forEach(step => {
        step.style.display = 'none';
    });
}

// 복무 유형 선택
function selectDutyType(type) {
    travelWizardData.dutyType = type;

    document.querySelectorAll('.duty-option').forEach(option => {
        option.classList.remove('selected');
    });

    event.currentTarget.classList.add('selected');
    document.getElementById('next-step2').disabled = false;
}

// 시간 변환 함수 (소수점 시간을 HH:MM 형식으로)
function convertDecimalToTime(decimalHour) {
    const hours = Math.floor(decimalHour);
    const minutes = Math.round((decimalHour - hours) * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

// 여행 복무 자동 계산
function calculateTravelDuty() {
    const departureDateTime = new Date(`${travelWizardData.departureDate}T${travelWizardData.departureTime}`);
    const arrivalDateTime = new Date(`${travelWizardData.arrivalDate}T${travelWizardData.arrivalTime}`);

    console.log('=== 여행 정보 ===');
    console.log('출국:', departureDateTime);
    console.log('입국:', arrivalDateTime);
    console.log('복무 유형:', travelWizardData.dutyType);

    // 국외자율연수: 출국일~입국일 전체 기간 그대로 적용
    if (travelWizardData.dutyType === 'overseas') {
        calculateOverseasDuty(departureDateTime, arrivalDateTime);
        return;
    }

    // 연가: 근무일 기준 계산
    calculateVacationDuty(departureDateTime, arrivalDateTime);
}

// 국외자율연수 계산 (출국일~입국일 전체 기간)
function calculateOverseasDuty(departureDateTime, arrivalDateTime) {
    const departureDate = new Date(departureDateTime);
    departureDate.setHours(0, 0, 0, 0);

    const arrivalDate = new Date(arrivalDateTime);
    arrivalDate.setHours(0, 0, 0, 0);

    // 출국일부터 입국일까지 모든 날짜 수집
    const allDates = [];
    const currentDate = new Date(departureDate);

    while (currentDate <= arrivalDate) {
        allDates.push({
            date: new Date(currentDate),
            isWorkDay: true // 국외자율연수는 모든 날짜가 연수일
        });
        currentDate.setDate(currentDate.getDate() + 1);
    }

    // 결과 저장 (전체 기간, 시간 계산 없음)
    travelWizardData.calculatedDates = [{
        date: departureDate,
        dateString: dutyManager.formatDateForStorage(departureDate),
        startTime: '08:40', // 국외연수는 전일로 처리
        endTime: '16:40',
        endDate: arrivalDate,
        allDates: allDates
    }];

    console.log('국외자율연수 기간:', allDates.length, '일');
    displayCalculationResult();
    generateReasonText();
}

// 연가 계산 (근무일 기준)
function calculateVacationDuty(departureDateTime, arrivalDateTime) {
    // 1. 첫 번째 근무일 찾기
    const firstWorkDay = findFirstWorkDay(departureDateTime);

    // 2. 마지막 근무일 찾기
    const lastWorkDay = findLastWorkDay(arrivalDateTime);

    console.log('첫 근무일:', firstWorkDay);
    console.log('마지막 근무일:', lastWorkDay);

    if (!firstWorkDay || !lastWorkDay) {
        // 근무일이 없으면 연가 불필요
        travelWizardData.calculatedDates = [];
        displayCalculationResult();
        generateReasonText();
        return;
    }

    // 3. 시작 시간과 종료 시간 계산
    const startTime = calculateStartTime(departureDateTime, firstWorkDay);
    const endTime = calculateEndTime(arrivalDateTime, lastWorkDay);

    console.log('시작 시간:', startTime);
    console.log('종료 시간:', endTime);

    // 4. 중간 날짜들 수집 (시각적 표시용)
    const allDates = collectAllDates(firstWorkDay.date, lastWorkDay.date);

    // 5. 결과 저장
    travelWizardData.calculatedDates = [{
        date: firstWorkDay.date,
        dateString: dutyManager.formatDateForStorage(firstWorkDay.date),
        startTime: startTime,
        endTime: endTime,
        endDate: lastWorkDay.date,
        allDates: allDates // 주말 포함 모든 날짜
    }];

    // 결과 표시
    displayCalculationResult();
    generateReasonText();
}

// 첫 번째 날짜 찾기 (출국일 기준)
function findFirstWorkDay(departureDateTime) {
    const depHour = departureDateTime.getHours() + departureDateTime.getMinutes() / 60;
    const workEnd = 16.67; // 16:40
    const depDate = new Date(departureDateTime);
    depDate.setHours(0, 0, 0, 0);

    // 출국일이 근무 시간 이전이면 출국일부터
    if (depHour <= workEnd) {
        return { date: new Date(depDate), needsVacation: true };
    }

    // 근무 시간 이후 출국이면 다음날부터
    const nextDay = new Date(depDate);
    nextDay.setDate(nextDay.getDate() + 1);
    return { date: new Date(nextDay), needsVacation: true };
}

// 마지막 날짜 찾기 (입국일 기준) - 주말 포함
function findLastWorkDay(arrivalDateTime) {
    const arrHour = arrivalDateTime.getHours() + arrivalDateTime.getMinutes() / 60;
    const workStart = 8.67; // 08:40
    const arrDate = new Date(arrivalDateTime);
    arrDate.setHours(0, 0, 0, 0);

    // 입국일이 근무 시간 이후면 입국일까지
    if (arrHour > workStart) {
        return { date: new Date(arrDate), needsVacation: true };
    }

    // 근무 시간 이전 입국이면 전날까지
    const prevDay = new Date(arrDate);
    prevDay.setDate(prevDay.getDate() - 1);
    return { date: new Date(prevDay), needsVacation: true };
}

// 실제 근무일인지 확인 (주말/공휴일 제외)
function isActualWorkDay(date) {
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const isHoliday = dutyManager.isHoliday(date);
    const isInVacation = date >= new Date(dutyManager.vacationStart) &&
                        date <= new Date(dutyManager.vacationEnd);
    return isInVacation && !isWeekend && !isHoliday;
}

// 시작 시간 계산
function calculateStartTime(departureDateTime, firstWorkDay) {
    const depHour = departureDateTime.getHours() + departureDateTime.getMinutes() / 60;
    const workStart = 8.67; // 08:40
    const workEnd = 16.67; // 16:40
    const depDate = new Date(departureDateTime);
    depDate.setHours(0, 0, 0, 0);

    // 첫 근무일이 출국일인 경우
    if (depDate.toDateString() === firstWorkDay.date.toDateString()) {
        // 근무 시간 전 출국 → 출국 시간부터 연가
        if (depHour < workStart) {
            const hours = departureDateTime.getHours();
            const minutes = departureDateTime.getMinutes();
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        }
        // 근무 시간 중 출국 → 08:40부터 연가 (하루 단위)
        else if (depHour <= workEnd) {
            return '08:40';
        }
        // 근무 시간 이후 출국 → 다음날부터이므로 이 경우는 발생 안 함
    }

    // 기본: 다음날 00:00부터 (근무시간 이후 출발)
    return '00:00';
}

// 종료 시간 계산
function calculateEndTime(arrivalDateTime, lastWorkDay) {
    const arrHour = arrivalDateTime.getHours() + arrivalDateTime.getMinutes() / 60;
    const workStart = 8.67; // 08:40
    const workEnd = 16.67; // 16:40
    const arrDate = new Date(arrivalDateTime);
    arrDate.setHours(0, 0, 0, 0);

    // 마지막 날짜가 입국일인 경우
    if (arrDate.toDateString() === lastWorkDay.date.toDateString()) {
        // 근무 시간 이후 입국 → 입국 시간까지 연가
        if (arrHour > workEnd) {
            const hours = arrivalDateTime.getHours();
            const minutes = arrivalDateTime.getMinutes();
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        }
        // 근무 시간 중 입국 → 16:40까지 연가 (하루 단위)
        else if (arrHour > workStart) {
            return '16:40';
        }
    }

    // 입국 전날까지 → 24:00
    return '24:00';
}

// 모든 날짜 수집 (시각적 표시용)
function collectAllDates(startDate, endDate) {
    const dates = [];
    const current = new Date(startDate);

    while (current <= endDate) {
        dates.push({
            date: new Date(current),
            isWorkDay: isActualWorkDay(current),
            isWeekend: current.getDay() === 0 || current.getDay() === 6
        });
        current.setDate(current.getDate() + 1);
    }

    return dates;
}

// 계산 결과 표시 (통합 연가 버전)
function displayCalculationResult() {
    const resultDiv = document.getElementById('calculation-result');

    if (travelWizardData.calculatedDates.length === 0) {
        resultDiv.innerHTML = `
            <div style="color: #28a745; font-weight: bold;">
                ✅ 복무 신청이 필요하지 않습니다!
            </div>
            <div style="font-size: 14px; margin-top: 8px; color: #666;">
                출입국 시간이 근무시간과 겹치지 않습니다.
            </div>
        `;
        return;
    }

    const dutyTypeName = travelWizardData.dutyType === 'vacation' ? '연가' : '국외자율연수';
    const period = travelWizardData.calculatedDates[0];

    const startDateStr = dutyManager.formatDate(period.date);
    const startDayOfWeek = dutyManager.getDayOfWeek(period.date);
    const endDateStr = dutyManager.formatDate(period.endDate);
    const endDayOfWeek = dutyManager.getDayOfWeek(period.endDate);

    // 주말/공휴일 제외 실제 근무일 수 계산
    const workDaysCount = period.allDates.filter(d => d.isWorkDay).length;
    const weekendCount = period.allDates.filter(d => d.isWeekend).length;


    // 연가일 경우에만 근무일 차감 정보 표시
    const workDayInfo = travelWizardData.dutyType === 'vacation' ? `
        <div style="font-size: 13px; color: #666; margin-top: 10px;">
            • 실제 연가일: ${workDaysCount}일 (근무일만 차감)
            ${weekendCount > 0 ? `<br>• 주말/공휴일: ${weekendCount}일 (자동 제외)` : ''}
        </div>
        <div style="font-size: 12px; color: #999; margin-top: 8px; padding: 8px; background: #f8f9fa; border-radius: 4px;">
            💡 나이스에서 자동으로 주말/공휴일을 제외하고 연가를 차감합니다.
        </div>
    ` : '';

    resultDiv.innerHTML = `
        <div style="color: #6f42c1; font-weight: bold; margin-bottom: 10px;">
            📋 ${dutyTypeName} 신청이 필요합니다
        </div>
        <div style="font-size: 14px; margin-bottom: 10px; padding: 10px; background: white; border-radius: 6px;">
            <strong>${startDateStr}(${startDayOfWeek}) ${period.startTime} ~ ${endDateStr}(${endDayOfWeek}) ${period.endTime}</strong>
        </div>
        ${workDayInfo}
    `;
}

// 사유 텍스트 생성
function generateReasonText() {
    const depDate = new Date(travelWizardData.departureDate);
    const arrDate = new Date(travelWizardData.arrivalDate);

    const depYear = depDate.getFullYear();
    const depMonth = (depDate.getMonth() + 1).toString();
    const depDay = depDate.getDate().toString();
    const depDayOfWeek = dutyManager.getDayOfWeek(depDate);

    const arrYear = arrDate.getFullYear();
    const arrMonth = (arrDate.getMonth() + 1).toString();
    const arrDay = arrDate.getDate().toString();
    const arrDayOfWeek = dutyManager.getDayOfWeek(arrDate);

    const reasonText = `${travelWizardData.destination}(여행기간: ${depYear}.${depMonth}.${depDay}.(${depDayOfWeek}) ${travelWizardData.departureTime}~${arrYear}.${arrMonth}.${arrDay}.(${arrDayOfWeek}) ${travelWizardData.arrivalTime})`;

    document.getElementById('generated-reason').value = reasonText;

    // 메인 패널에도 사유 표시
    document.getElementById('main-generated-reason').value = reasonText;
    document.getElementById('reason-section').style.display = 'block';
}

// 사유 복사
function copyReason() {
    const reasonText = document.getElementById('generated-reason').value;
    navigator.clipboard.writeText(reasonText).then(() => {
        alert('사유가 클립보드에 복사되었습니다!');
    }).catch(() => {
        alert('복사 기능을 지원하지 않는 브라우저입니다.');
    });
}

// 여행 일정 적용 (통합 연가 버전)
function applyTravelSchedule() {
    if (travelWizardData.calculatedDates.length === 0) {
        alert('적용할 복무 일정이 없습니다.');
        closeTravelWizard();
        return;
    }

    const period = travelWizardData.calculatedDates[0];
    const allDates = period.allDates;

    let workDaysCount = 0;
    let weekendCount = 0;

    // 세부 시간 정보 초기화
    if (!dutyManager.detailSchedule) {
        dutyManager.detailSchedule = {};
    }

    // 모든 날짜에 적용
    allDates.forEach((dateInfo, index) => {
        const dateString = dutyManager.formatDateForStorage(dateInfo.date);
        const isFirstDay = index === 0;
        const isLastDay = index === allDates.length - 1;

        // 모든 날짜에 연가 타입 적용 (주말 포함)
        dutyManager.dutySchedule[dateString] = travelWizardData.dutyType;

        if (dateInfo.isWorkDay) {
            // 근무일 - 연가 적용
            // 시간 설정
            let dayStartTime = '08:40';
            let dayEndTime = '16:40';

            if (isFirstDay) {
                dayStartTime = period.startTime;
            }
            if (isLastDay) {
                dayEndTime = period.endTime;
            }

            dutyManager.detailSchedule[dateString] = [{
                start: dayStartTime,
                end: dayEndTime,
                type: travelWizardData.dutyType,
                isWorkDay: true
            }];

            workDaysCount++;
        } else if (dateInfo.isWeekend) {
            // 주말 - 같은 연가 타입으로 저장하되 플래그로 구분
            dutyManager.detailSchedule[dateString] = [{
                start: '00:00',
                end: '24:00',
                type: travelWizardData.dutyType,
                isWeekendExcluded: true
            }];
            weekendCount++;
        }
    });

    // 저장 및 화면 업데이트
    dutyManager.saveVacationSettings();
    dutyManager.renderCalendar();

    alert(`해외여행 일정이 적용되었습니다!\n• 연가: ${workDaysCount}일\n• 주말 제외: ${weekendCount}일`);
    closeTravelWizard();
}

// 전역 함수
function showFirebaseSettings() {
    if (dutyManager) {
        dutyManager.showFirebaseSettingsModal();
    }
}

function saveFirebaseSettings() {
    const apiKey = document.getElementById('firebaseApiKey').value.trim();
    const projectId = document.getElementById('firebaseProjectId').value.trim();

    if (!apiKey || !projectId) {
        alert('API Key와 Project ID를 모두 입력해주세요.');
        return;
    }

    localStorage.setItem('firebase_apiKey', apiKey);
    localStorage.setItem('firebase_projectId', projectId);

    document.getElementById('firebaseModal').style.display = 'none';
    alert('Firebase 설정이 저장되었습니다!\n페이지를 새로고침합니다.');
    location.reload();
}

function clearFirebaseSettings() {
    if (confirm('저장된 Firebase 설정을 삭제하시겠습니까?')) {
        localStorage.removeItem('firebase_apiKey');
        localStorage.removeItem('firebase_projectId');
        document.getElementById('firebaseApiKey').value = '';
        document.getElementById('firebaseProjectId').value = '';
        document.getElementById('savedSettingsInfo').style.display = 'none';

        if (dutyManager) {
            dutyManager.updateFirebaseStatus(false);
        }

        alert('저장된 Firebase 설정이 삭제되었습니다.');
    }
}

// Firebase 전송 버튼
function sendToFirebase() {
    if (!dutyManager) {
        alert('시스템 초기화 중입니다. 잠시 후 다시 시도해주세요.');
        return;
    }

    if (!dutyManager.firebaseEnabled) {
        alert('⚠️ Firebase에 연결되어 있지 않습니다.\n\n"⚙️ Firebase 설정" 버튼을 눌러 설정을 완료해주세요.');
        return;
    }

    const teacherName = document.getElementById('teacher-name').value.trim();
    const teacherDepartment = document.getElementById('teacher-department').value.trim();

    if (!teacherName || !teacherDepartment) {
        alert('⚠️ 이름과 부서를 먼저 입력해주세요.');
        return;
    }

    // Firebase에 저장
    dutyManager.saveToFirebase()
        .then(() => {
            alert('✅ Firebase 전송 완료!\n\n관리자 페이지(admin.html)에서 확인할 수 있습니다.');
        })
        .catch((error) => {
            console.error('Firebase 전송 실패:', error);
            alert('❌ Firebase 전송 실패\n\n' + error.message);
        });
}

// 마우스 이벤트 처리 (드래그 앤 드롭용)
document.addEventListener('DOMContentLoaded', () => {
    // 페이지 로드 완료 후 추가 설정이 필요하면 여기에
});
// 메인 패널 사유 복사
function copyMainReason() {
    const reasonText = document.getElementById('main-generated-reason').value;
    navigator.clipboard.writeText(reasonText).then(() => {
        alert('사유가 클립보드에 복사되었습니다!');
    }).catch(() => {
        alert('복사 기능을 지원하지 않는 브라우저입니다.');
    });
}
