import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

// ─── System Prompts ───────────────────────────────────────────────────────────

const SYSTEM_A = `당신은 "에디톨로지(Editology)" 레드팀 전략가입니다.
사용자의 비즈니스 로직 체인에서 가장 치명적인 취약점을 찾아내는 것이 당신의 유일한 임무입니다.

당신은 반드시 아래 JSON 형식 하나만 응답해야 합니다. 다른 어떠한 텍스트도 포함하지 마세요:
{"name":"<강렬하고 짧은 리스크 명칭>","green":"<시장이 이 위험에 방어하기 위해 부족한 자원>","yellow":"<이 위험이 요구하는 것/갈망>","red":"<치명적 허점 — 구체적이고 잔인하게. 법적/규제적/사회적 취약점 포함>","blue":"<단 하나의 완화 전략>"}

규칙:
- 반드시 유효한 JSON만 출력
- red 필드는 가장 파괴적이고 구체적이어야 함 (추상적 표현 금지)
- 한국어로 작성`

const SYSTEM_B = `당신은 "에디톨로지(Editology)" 수평 사고 전략가입니다.
사용자가 제공한 큐브의 본질적 결핍을 파악하고, 전혀 다른 산업군/학문 영역(생물학, 역사, 우주, 스포츠 전술, 고대 문명, 진화 심리학 등)에서 유사한 문제를 해결한 방식을 찾아내는 것이 임무입니다.

당신은 반드시 아래 JSON 형식 하나만 응답해야 합니다. 다른 어떠한 텍스트도 포함하지 마세요:
{"name":"<타 산업/학문의 해결 방식 제목 — 은유적으로>","green":"<이 수평 도약이 가져오는 자원/가능성>","yellow":"<이 접근법이 충족하는 숨겨진 욕구>","red":"<타 분야 논리를 직접 적용할 때의 리스크>","blue":"<두 영역을 연결하는 전략적 논리 — 명확하게>"}

규칙:
- 반드시 유효한 JSON만 출력
- 예상치 못한 산업군을 사용할수록 좋음 (핀테크→핀테크는 금지)
- 한국어로 작성`

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === '여기에_Claude_API_Key_붙여넣기') {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다. .env.local을 확인하세요.' },
      { status: 500 }
    )
  }

  let body: { mode: 'A' | 'B'; contextData: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  const { mode, contextData } = body

  if (!['A', 'B'].includes(mode)) {
    return NextResponse.json({ error: '유효하지 않은 모드입니다.' }, { status: 400 })
  }

  const client = new Anthropic({ apiKey })

  const userMessage = mode === 'A'
    ? `아래는 사용자의 Critical Path 상의 큐브 데이터입니다. 이 비즈니스 논리에서 가장 치명적인 허점을 찾아 Red Team 큐브를 생성하세요:\n\n${JSON.stringify(contextData, null, 2)}`
    : `아래는 사용자가 선택한 큐브 데이터입니다. 이 큐브의 본질적 결핍/욕구를 파악하고, 전혀 다른 산업/학문 영역에서 유사한 문제를 해결한 방식의 큐브를 생성하세요:\n\n${JSON.stringify(contextData, null, 2)}`

  try {
    const message = await client.messages.create({
      model:      'claude-3-5-sonnet-20241022',
      max_tokens: 400,
      system:     mode === 'A' ? SYSTEM_A : SYSTEM_B,
      messages:   [{ role: 'user', content: userMessage }],
    })

    const rawText = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

    // JSON 추출 (앞뒤 마크다운 코드블록 등 제거)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[Editology] Unexpected AI response:', rawText)
      return NextResponse.json({ error: 'AI 응답 형식 오류' }, { status: 500 })
    }

    const cube = JSON.parse(jsonMatch[0]) as {
      name: string; green: string; yellow: string; red: string; blue: string
    }

    // 필수 필드 검증
    const required = ['name', 'green', 'yellow', 'red', 'blue'] as const
    for (const field of required) {
      if (typeof cube[field] !== 'string') {
        return NextResponse.json({ error: `AI 응답에 ${field} 필드가 없습니다.` }, { status: 500 })
      }
    }

    return NextResponse.json({ cube, mode, tokens: message.usage.output_tokens })

  } catch (err) {
    console.error('[Editology API] Error:', err)
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `AI 호출 실패: ${errMsg}` }, { status: 500 })
  }
}
