# 음원 출처 및 라이선스

## william-tell-finale.mp3

- **곡**: 〈윌리엄 텔 서곡 (William Tell Overture)〉 중 피날레 "스위스 군대의 행진"
- **작곡**: 조아키노 로시니 (Gioachino Rossini), 1829년. **작곡 자체는 퍼블릭 도메인**입니다.
- **편곡**: Wenzel Sedlak (관악 편곡)
- **연주**: United States Marine Band (지휘 Timothy Foley), 앨범 *Grand Scenes* (2000)
- **저작권**: 미국 연방정부 소속 기관의 공무상 저작물 → **퍼블릭 도메인 (Public Domain)**
- **출처**: Wikimedia Commons
  https://commons.wikimedia.org/wiki/File:Gioachino_Rossini,_William_Tell_Overture_(military_band_version,_2000).ogg
- **원본 파일**: Ogg Vorbis / 160 kbps / 44.1 kHz / 스테레오 / 662초 (서곡 전체)

### 가공

- 원본 **7:01 ~ 10:57** 구간(트럼펫 팡파르부터 곡 끝까지, 236초)만 잘라냈습니다.
- 시작 0.4초 페이드인, 끝 4초 페이드아웃 (반복 재생 시 이음매 완화).
- Safari 호환을 위해 MP3 128 kbps로 변환했습니다.

### 게임에서의 재생

```js
const AUDIO = {
  src: 'audio/william-tell-finale.mp3',
  startAt: 42,   // 파일 0:42 = 원곡 7:43, 말발굽 갤럽 주제 시작
  volume: 0.5
};
```

- 온셋 자기상관 분석에서 원곡 7:43 이후 **♩ ≈ 150 BPM** 갤럽 리듬이 안정적으로 잡힙니다.
- 40초 한 판 동안 갤럽 구간이 흐르고, 음원은 반복(loop) 재생됩니다.
- 시작점이 마음에 들지 않으면 `startAt`만 바꾸세요 (0 = 팡파르부터).

> 상업 공간(매장·부스)에서 사용할 때: 이 녹음은 퍼블릭 도메인이라 음원 사용료는
> 없습니다. 다만 국내 매장 내 음악 재생에 대한 공연권 관련 규정은 별도로
> 확인하시기 바랍니다.
