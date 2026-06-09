import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-6 text-white">
      <h1 className="text-3xl font-bold text-pink-400">Face Paint AR</h1>
      <div className="flex gap-4">
        <Link
          href="/try-on"
          className="bg-pink-500 hover:bg-pink-600 text-white px-6 py-3 rounded-xl font-medium"
        >
          体験する
        </Link>
        <Link
          href="/admin"
          className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-xl font-medium"
        >
          管理画面
        </Link>
      </div>
    </main>
  )
}
